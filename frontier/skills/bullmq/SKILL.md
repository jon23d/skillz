---
name: bullmq
description: Use when implementing background jobs, task queues, job processing, workers, delayed jobs, retries, or any BullMQ/Redis queue integration in Node.js TypeScript projects.
---

# BullMQ

BullMQ is a Redis-backed job queue for Node.js. Jobs are added to a `Queue`, consumed by `Worker`s, and persisted in Redis via `ioredis`.

## Installation

```
npm install bullmq ioredis
```

## Queue + Worker — canonical pattern

```ts
import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';

export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
}

// Connection options — BullMQ manages ioredis internally
const connection: ConnectionOptions = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  // Fail fast if Redis is unreachable at startup — prevents silent hangs
  enableOfflineQueue: false,
};

// Queue — define defaultJobOptions once; every job inherits them
export const emailQueue = new Queue<EmailPayload>('email', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1_000 }, // 1 s → 2 s → 4 s
    removeOnComplete: { count: 1_000 }, // keep last 1000 completed
    removeOnFail: { count: 5_000 },     // keep last 5000 failed for inspection
  },
});

// Worker — process jobs; always handle the error event
// Worker<TData, TResult> — use TResult when the processor returns a value
export const emailWorker = new Worker<EmailPayload, void>(
  'email',
  async (job: Job<EmailPayload, void>) => {
    console.log(`Sending email to ${job.data.to}`);
    // ... send email
  },
  { connection, concurrency: 5 },
);

// Example with a return value — listen for it via the 'completed' event
// const reportWorker = new Worker<ReportPayload, string>(
//   'report',
//   async (job): Promise<string> => `report-${job.data.userId}.pdf`,
//   { connection },
// );
// reportWorker.on('completed', (job, result: string) => console.log(result));

// Unhandled 'error' events crash the Node.js process — always attach this
emailWorker.on('error', (err) => console.error('Worker error:', err));
```

## Adding jobs

```ts
// Immediate job — inherits defaultJobOptions from queue
await emailQueue.add('send-email', { to: 'alice@example.com', subject: 'Hi', body: '...' });

// Delayed job — override delay per-call; retry policy still inherited
await emailQueue.add('send-email', payload, { delay: 5_000 });

// Priority job (lower number = higher priority)
await emailQueue.add('send-email', payload, { priority: 1 });
```

## Job options reference

- `attempts` — total tries (including first); default 0 (unlimited retries)
- `backoff.type` — `'fixed'` or `'exponential'`; `exponential` doubles each time
- `delay` — ms to wait before job becomes active
- `priority` — 1 (highest) to MAX_INT; jobs with lower numbers run first
- `removeOnComplete` — `true` removes all; `{ count: N }` keeps last N
- `removeOnFail` — same; keep failed jobs long enough to diagnose

## Graceful shutdown

Always close workers and queues to drain in-flight jobs and release Redis connections:

```ts
async function shutdown() {
  await emailWorker.close(); // waits for active jobs to finish
  await emailQueue.close();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

Do **not** skip `worker.close()` — it causes stalled job detection on the next start.

## Testing with Vitest + TestContainers

Use a real Redis instance via `@testcontainers/redis`. Never mock the Queue or Worker — mocks do not catch connection bugs or serialization issues.

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60_000,   // Docker pull can be slow on cold machines
    hookTimeout: 60_000,
  },
});
```

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { Queue, Worker, type Job } from 'bullmq';

describe('email worker', () => {
  let container: StartedRedisContainer;
  let connection: { host: string; port: number };

  beforeAll(async () => {
    container = await new RedisContainer('redis:7-alpine').start();
    connection = {
      host: container.getHost(),
      port: container.getMappedPort(6379),
    };
  });

  afterAll(async () => {
    await container.stop();
  });

  it('processes a job and returns the result', async () => {
    const processed: string[] = [];
    const queue = new Queue<{ to: string }>('test-email', { connection });
    const worker = new Worker<{ to: string }>(
      'test-email',
      async (job) => { processed.push(job.data.to); },
      { connection },
    );
    worker.on('error', (err) => { throw err; });

    const job = await queue.add('send', { to: 'test@example.com' });

    await new Promise<void>((resolve, reject) => {
      worker.on('completed', (j: Job) => { if (j.id === job.id) resolve(); });
      worker.on('failed', (_j, err) => reject(err));
    });

    expect(processed).toEqual(['test@example.com']);

    await worker.close();
    await queue.close();
  });
});
```

**Testing checklist:**
- `@testcontainers/redis` and `testcontainers` in `devDependencies`
- `testTimeout` and `hookTimeout` both set to 60 s in `vitest.config.ts`
- Close worker **before** queue in `afterEach`/test teardown
- Use a unique queue name per test suite — unique means unique *within the same Redis instance*; if each suite starts its own container the names can overlap safely
- Attach `worker.on('error', ...)` even in tests — unhandled errors cause false test failures
- To verify `removeOnComplete`/`removeOnFail` are set, check `job.opts` after `queue.add()`: `expect(job.opts.removeOnComplete).toEqual({ count: 1000 })`

## Common mistakes

- **Retry policy per `add()` call** — put it in `defaultJobOptions` so it can't be accidentally omitted
- **Passing a raw `ioredis` client to both Queue and Worker** — BullMQ needs separate connections internally; pass `ConnectionOptions`, not an `ioredis` instance
- **Skipping `removeOnComplete`/`removeOnFail`** — completed jobs accumulate in Redis forever; set a count limit
- **No `worker.on('error', ...)` handler** — unhandled `EventEmitter` error events crash the Node.js process
- **Skipping `worker.close()` on shutdown** — active jobs become "stalled" and are retried unnecessarily on restart
- **`enableOfflineQueue: true` (default)** — queues commands while Redis is down, then replays them; set to `false` to fail fast in production
