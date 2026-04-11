---
name: arq
description: Use when implementing background jobs, task queues, scheduled jobs, retries, or any Redis-backed async worker in a Python backend service in this harness. arq is the chosen queue (async-native, Redis-backed). Replaces the old bullmq skill.
---

# arq — Async Redis Queue

[arq](https://arq-docs.helpmanual.io/) is a small, async-native job queue backed by Redis. It is the only background job system in this harness.

## When to use arq vs FastAPI BackgroundTasks

| Need | Use |
|---|---|
| Trivial fire-and-forget that completes inside the request lifecycle | FastAPI `BackgroundTasks` |
| Anything that must survive a process restart | **arq** |
| Anything that must retry on failure | **arq** |
| Anything that must run on a schedule (cron) | **arq** |
| Anything that hits a slow third-party API | **arq** |
| Anything where the user does not need to wait for the result | **arq** |

If in doubt, use arq.

## Install

```bash
uv add arq
```

## Project layout

```
app/
  workers/
    __init__.py
    settings.py     # WorkerSettings — defines functions, schedule, redis URL
    jobs/
      email.py
      reports.py
```

## Defining jobs

A job is an `async def` function that takes `ctx` as its first argument. `ctx` is a dict; arq populates it with the redis pool and the job metadata.

```python
# app/workers/jobs/email.py
from typing import Any

import structlog

log = structlog.get_logger()


async def send_welcome_email(ctx: dict[str, Any], user_id: str, email: str) -> None:
    log.info("send_welcome_email.start", user_id=user_id, job_id=ctx["job_id"])
    # Call your email service here
    log.info("send_welcome_email.done", user_id=user_id)
```

Rules:

- **Always async.** Sync workers block the event loop.
- **`ctx` first, then arguments.** Arguments are pickled and stored in Redis — keep them small and primitive (IDs, strings, numbers — never ORM objects).
- **Idempotent.** A retry must not double-charge, double-send, or double-anything. Use a `dedupe_key` (job ID, request ID) the job checks before doing real work.
- **Bounded execution time.** Set `job_timeout` per worker (see settings below). A job that hangs forever blocks a worker slot.

## Worker settings

```python
# app/workers/settings.py
from arq.connections import RedisSettings
from arq.cron import cron

from app.core.config import get_settings
from app.core.db import async_session_maker
from app.core.logging import configure_logging
from app.workers.jobs.email import send_welcome_email
from app.workers.jobs.reports import generate_daily_report


async def startup(ctx: dict) -> None:
    configure_logging()
    ctx["session_maker"] = async_session_maker


async def shutdown(ctx: dict) -> None:
    pass


class WorkerSettings:
    functions = [send_welcome_email]
    cron_jobs = [
        cron(generate_daily_report, hour=2, minute=0),  # 02:00 UTC daily
    ]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url.unicode_string())
    max_jobs = 20
    job_timeout = 300            # seconds — kill any job that runs longer
    keep_result = 3600           # seconds — how long results stay in Redis
    max_tries = 3                # retries before a job is dead-lettered
```

Run the worker with: `uv run arq app.workers.settings.WorkerSettings`.

## Enqueuing from FastAPI

The Redis pool is shared with the API. Create it in the FastAPI lifespan and store it on `app.state`.

```python
# app/main.py
from arq import create_pool
from arq.connections import RedisSettings


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.redis = await create_pool(
        RedisSettings.from_dsn(settings.redis_url.unicode_string())
    )
    yield
    await app.state.redis.close()
```

```python
# app/api/v1/users.py
from fastapi import Request


@router.post("/users", response_model=UserRead, status_code=201)
async def create_user(
    payload: UserCreate,
    request: Request,
    db=Depends(get_db),
) -> UserRead:
    user = await user_service.create(db, payload)
    await request.app.state.redis.enqueue_job(
        "send_welcome_email",
        user.id,
        user.email,
    )
    return user
```

Rules:

- **Pass IDs, not objects.** Look up the row inside the job using the ID, against a fresh session. The session that created the row may not be committed yet when the job picks it up.
- **Enqueue *after* `db.flush()`** so the row exists, but be aware the request transaction may still roll back. For at-least-once delivery semantics: the job should `SELECT` the row and exit cleanly if it does not exist.
- **Use a typed enqueue helper** if you have more than ~5 jobs:
  ```python
  async def enqueue_send_welcome(redis, *, user_id: str, email: str) -> None:
      await redis.enqueue_job("send_welcome_email", user_id, email)
  ```

## Database access inside a job

Jobs do **not** use the FastAPI `get_db` dependency. They make their own session from the `session_maker` placed in `ctx` by `startup`.

```python
async def generate_daily_report(ctx: dict[str, Any]) -> None:
    session_maker = ctx["session_maker"]
    async with session_maker() as db:
        async with db.begin():
            # do work
            ...
        # `async with db.begin()` commits on exit
```

Each job gets its own session and its own transaction. Never reuse sessions across jobs.

## Retries and failures

- arq retries up to `max_tries` automatically on any unhandled exception.
- Use `Retry(defer=...)` to schedule a retry with a custom delay (e.g. exponential backoff for rate-limited APIs):
  ```python
  from arq.worker import Retry

  async def call_third_party(ctx, payload):
      try:
          await client.post(...)
      except RateLimitError as exc:
          raise Retry(defer=exc.retry_after_seconds)
  ```
- After `max_tries`, the job is logged and dropped. There is no built-in dead-letter queue — if you need durable failure inspection, write the job and its error to a database table from the failing job's `except` block before re-raising.

## Scheduled jobs

`cron(...)` entries in `WorkerSettings.cron_jobs` run on the same worker. For non-trivial schedules, prefer one explicit cron line per job over clever conditionals — they are easier to read and harder to break.

```python
cron_jobs = [
    cron(generate_daily_report,        hour=2,  minute=0),
    cron(reconcile_billing,            hour=3,  minute=0),
    cron(cleanup_expired_sessions,     minute={0, 30}),  # every 30 min
]
```

## Testing jobs

Test the *function* directly with `pytest-asyncio` — do not spin up arq.

```python
async def test_send_welcome_email(monkeypatch):
    sent: list[str] = []
    monkeypatch.setattr("app.workers.jobs.email.email_client.send",
                        lambda **kw: sent.append(kw["to"]))
    await send_welcome_email({"job_id": "test"}, user_id="u1", email="a@b.test")
    assert sent == ["a@b.test"]
```

For an end-to-end test that exercises the queue itself, use `arq.worker.Worker.run_check` against an in-memory Redis (`fakeredis.aioredis`).

## Common mistakes

- **Passing ORM objects as job arguments** — they are pickled, lose their session, and explode on first attribute access. Pass IDs.
- **Calling `commit()` inside a job using `async with session_maker() as db:`** — let `async with db.begin():` manage the transaction.
- **No idempotency check** — a retry double-sends. Always design for at-least-once.
- **Long-running jobs without `job_timeout`** — one stuck job blocks a worker slot indefinitely.
- **Sync Redis client (`redis-py` sync)** — wrong. arq uses the async client; do not mix.
- **Importing the worker module from the FastAPI app** — creates circular imports. Workers import from `app.services`/`app.core`, the app does not import from `app.workers`.
- **Reusing `app.state.redis` for non-arq Redis operations** — fine technically, but document it; arq's pool is sized for queue ops.
