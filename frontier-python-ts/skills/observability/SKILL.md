---
name: observability
description: Observability standards and instrumentation conventions. Load this skill when reviewing code for observability gaps, or when implementing logging, metrics, tracing, or health checks. Covers the four observability signals and stack-specific conventions for each supported language.
---

# Observability Standards

Observability is the ability to understand what a system is doing in production from
its external outputs alone. This skill defines what "good" looks like across four
primary signals and governs how the `reviewer` evaluates code for observability.

---

## The Four Signals

Every production service should emit all four signals. The absence of any one of them
creates a category of failure that is invisible to operators.

| Signal | What it answers |
|---|---|
| **Logs** | What happened and when, in enough detail to reconstruct a sequence of events |
| **Metrics** | How often and how fast — rates, latencies, counts, and queue depths over time |
| **Traces** | Where time is spent across service and async boundaries |
| **Health** | Is the service currently able to serve its purpose? |

---

## Universal Principles

These apply regardless of language, framework, or telemetry library.

### Logs

**Be structured.** Log output must be machine-parseable. Every log line should be a
key-value map or JSON object, not a free-form string. Unstructured logs cannot be
reliably queried, filtered, or alerted on.

**Use levels correctly.**

| Level | When to use |
|---|---|
| `trace` / `debug` | Development noise — loops, intermediate values, verbose state. Must not appear in production at default log level. |
| `info` | Meaningful lifecycle events: service started, job completed, user action taken. Should be low-volume. |
| `warn` | Something unexpected happened but the service recovered. Worth investigating if it recurs. |
| `error` | A failure that requires attention. Service may continue, but the operation failed. |
| `fatal` | Service cannot continue. Immediately precedes exit. |

**Propagate correlation IDs.** Every log line in a request-scoped path must include a
correlation or trace ID. This is the single most important thing for debuggability:
without it, log lines from concurrent requests are impossible to untangle.

- Extract the ID from the incoming request (e.g. `X-Correlation-ID`, `traceparent` header)
- Generate one if none is present
- Thread it through to every log line and every outgoing call within that request scope

**Never log sensitive data.** The following must never appear in log output:
passwords, secrets, API keys, tokens, full PII (names, emails, phone numbers,
addresses in combination), payment card data, or full request bodies by default.
Log identifiers (user ID, order ID) — not values (email address, card number).

**Log errors with context.** A useful error log includes: the error message and stack,
the correlation ID, and the identifiers of the resources involved. It does not include
the full input payload by default.

### Metrics

**Measure what matters.** Not every function needs a metric. Prioritise:

1. **Request/task throughput** — how many operations per unit time
2. **Latency** — p50, p95, p99 for I/O-bound operations (HTTP, DB, cache, queue)
3. **Error rate** — errors as a distinct count or label, not absorbed into success
4. **Queue/batch depth** — for async systems, how much work is waiting

**Naming conventions** (stack-specific conventions below, but general rules):

- Use `snake_case`
- Prefix with the service name: `payments_charge_duration_ms`
- For counters, suffix with `_total`: `payments_charge_errors_total`
- For histograms/timers, suffix with the unit: `_duration_ms`, `_bytes`

**Avoid high-cardinality labels.** Labels like `user_id`, `request_id`, or `url_path`
with arbitrary values create metric cardinality explosions. Use bounded label values
(e.g. `status=success|error`, `method=GET|POST`).

### Distributed Tracing

**Instrument service boundaries.** At minimum, create or continue a trace span at
every point where work crosses a boundary: incoming HTTP request, outgoing HTTP call,
database query, message publish, message consume.

**Propagate context.** Extract trace context from incoming requests (W3C `traceparent`
header is the standard). Inject it into outgoing requests and async messages.

**Name spans usefully.** A span name should identify the operation type and resource:
`GET /users/:id`, `db.query users`, `queue.publish order.created`.

**Add attributes for debuggability.** Useful span attributes:
- `http.method`, `http.status_code`, `http.url` (sanitised)
- `db.system`, `db.operation`, `db.table`
- `messaging.system`, `messaging.destination`
- `error.type`, `error.message` when the span represents a failure

### Health Endpoints

**Every network service must have a health endpoint.** A service without one cannot
be monitored by infrastructure tooling (load balancers, Kubernetes, uptime checkers).

**Health checks must be meaningful.** A health endpoint that always returns `200 OK`
with no checks is worse than useless — it masks failures. Check:
- Database connectivity (can you run a lightweight query?)
- Cache reachability (can you reach the cache server?)
- Any external dependency that the service cannot function without

**Distinguish liveness from readiness if needed.** In environments that support it
(e.g. Kubernetes):
- **Liveness** (`/health/live`): is the process alive and not deadlocked?
- **Readiness** (`/health/ready`): is the service able to handle traffic right now?

A single `/health` endpoint is acceptable when liveness/readiness distinction is
not required by the deployment environment.

---

## Stack-Specific Conventions

### Backend — Python (FastAPI)

**Telemetry stack: OpenTelemetry + structlog + prometheus-client.** Logs go through `structlog`, metrics through the OpenTelemetry SDK or `prometheus-client`, traces through OpenTelemetry. The exporter is swappable; instrumentation is not.

#### Required packages

```bash
uv add structlog
uv add opentelemetry-api opentelemetry-sdk
uv add opentelemetry-instrumentation-fastapi
uv add opentelemetry-instrumentation-sqlalchemy
uv add opentelemetry-instrumentation-httpx
uv add opentelemetry-exporter-otlp-proto-http
uv add prometheus-client                    # /metrics endpoint
```

#### Bootstrap (in the FastAPI lifespan)

```python
# app/core/observability.py
import logging
import os

import structlog
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from app.core.config import get_settings


def configure_logging() -> None:
    settings = get_settings()
    logging.basicConfig(
        format="%(message)s",
        level=settings.log_level.upper(),
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            _inject_trace_context,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def _inject_trace_context(_, __, event_dict):
    span = trace.get_current_span()
    ctx = span.get_span_context() if span is not None else None
    if ctx is not None and ctx.is_valid:
        event_dict["trace_id"] = format(ctx.trace_id, "032x")
        event_dict["span_id"] = format(ctx.span_id, "016x")
    return event_dict


def configure_tracing(app, engine) -> None:
    settings = get_settings()
    if not settings.otel_exporter_otlp_endpoint:
        # Local dev with no collector — skip exporter setup but keep instrumentation,
        # so context propagation and log correlation still work.
        return

    resource = Resource.create({"service.name": settings.app_name, "service.version": settings.version})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=settings.otel_exporter_otlp_endpoint))
    )
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app)
    SQLAlchemyInstrumentor().instrument(engine=engine.sync_engine)
    HTTPXClientInstrumentor().instrument()
```

Call `configure_logging()` and `configure_tracing(app, engine)` from the FastAPI `lifespan` context manager — see the `fastapi` skill for the lifespan structure.

#### Logging usage

```python
import structlog

log = structlog.get_logger()


async def create_user(...):
    log.info("user.create.start", email=payload.email)
    try:
        user = ...
    except IntegrityError:
        log.warning("user.create.duplicate_email", email=payload.email)
        raise ConflictError(...)
    log.info("user.create.success", user_id=user.id)
    return user
```

Bind request-scoped context once per request, in middleware:

```python
@app.middleware("http")
async def request_context(request, call_next):
    request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(
        request_id=request_id,
        method=request.method,
        path=request.url.path,
    )
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response
```

Every log line emitted during the request will now carry `request_id`, `method`, `path`, plus the OpenTelemetry `trace_id` and `span_id` injected by `_inject_trace_context`.

Never use `print()` in production paths.

#### Metrics

```python
# app/core/metrics.py
from prometheus_client import Counter, Histogram

http_requests_total = Counter(
    "http_requests_total",
    "Total HTTP requests",
    labelnames=("method", "route", "status"),
)

http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    labelnames=("method", "route"),
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10),
)
```

Expose them at `/metrics`:

```python
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from fastapi import Response

@app.get("/metrics", include_in_schema=False)
def metrics_endpoint() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
```

Record at the observation point. Use **bounded** label values only — never `user_id`, `request_id`, or full URLs:

```python
http_requests_total.labels(method="GET", route="/users/{user_id}", status="200").inc()
```

#### Tracing — manual spans

Auto-instrumentation covers FastAPI, SQLAlchemy, and httpx. Add manual spans at business-operation boundaries that auto-instrumentation cannot see.

```python
from opentelemetry import trace

tracer = trace.get_tracer(__name__)


async def process_order(order_id: str) -> Order:
    with tracer.start_as_current_span("order.process") as span:
        span.set_attribute("order.id", order_id)
        try:
            return await do_work(order_id)
        except Exception as exc:
            span.record_exception(exc)
            span.set_status(trace.StatusCode.ERROR, str(exc))
            raise
```

#### Health endpoints

```python
from sqlalchemy import text

@router.get("/health/live", include_in_schema=False)
async def liveness() -> dict:
    return {"status": "ok"}


@router.get("/health/ready", include_in_schema=False)
async def readiness(db: AsyncSession = Depends(get_db)) -> dict:
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"db: {exc}")
    return {"status": "ready"}
```

Liveness must do nothing — it answers "is the process alive". Readiness must check every dependency the service cannot function without (DB, Redis, mandatory upstream services).

### Frontend — TypeScript (Vite + React)

The frontend's observability surface is smaller. Most of it is logs (console-only — there is no need for structured frontend logging in this harness) and error reporting.

- **Errors:** every uncaught exception goes to a single error reporter. If the project uses Sentry / Highlight / similar, mount the SDK in `src/main.tsx` *before* `ReactDOM.createRoot`. Without one, install a global `window.addEventListener("error", ...)` and `window.addEventListener("unhandledrejection", ...)` that POSTs to a backend endpoint.
- **Trace propagation:** if you want frontend → backend trace continuity, include the W3C `traceparent` header on outgoing API calls. Configure `openapi-fetch` to add it via a request middleware.
- **No PII in logs.** Same rule as the backend.
- **No health endpoint.** Static assets do not have health endpoints; the CDN owns that.

---

## What the Observability Reviewer Checks

Load this skill before reviewing. The reviewer evaluates against the universal
principles above, not against any specific library. A verdict of `"fail"` means
critical or major issues exist that leave operators blind in production.

Severity reference:

| Severity | Examples |
|---|---|
| **critical** | Caught exception with no log, no metric, no rethrow; sensitive data in a log statement; network service with no health endpoint; background worker with zero error signal |
| **major** | Unstructured logging in request path; no correlation ID on any log line in request-scoped code; no latency measurement on I/O operations; health endpoint that always returns 200 |
| **minor** | Log line missing a useful context field; wrong log level; high-cardinality metric label; span missing a useful attribute |
