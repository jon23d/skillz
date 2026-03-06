---
name: observability
description: Use when reviewing code for observability gaps, or when implementing logging, metrics, tracing, or health checks in any production service.
---

# Observability Standards

Every production service must emit all four signals. The absence of any one creates a category of failure that is invisible to operators.

- **Logs** — what happened and when, in enough detail to reconstruct a sequence of events
- **Metrics** — how often and how fast: rates, latencies, counts, queue depths
- **Traces** — where time is spent across service and async boundaries
- **Health** — is the service currently able to serve its purpose?

## Universal principles

### Logs

- **Structured output.** Every log line must be machine-parseable (JSON or key-value). Unstructured logs cannot be reliably queried or alerted on.
- **Use levels correctly:** `debug` for development noise (must not appear in production at default level); `info` for meaningful lifecycle events (low-volume); `warn` for unexpected but recovered conditions; `error` for failures requiring attention; `fatal` immediately before exit.
- **Propagate correlation IDs.** Every log line in a request-scoped path must include a correlation or trace ID. Extract from the incoming request (`X-Correlation-ID`, `traceparent`), generate one if absent, and thread it through to every outgoing call. Without this, log lines from concurrent requests are impossible to untangle.
- **Never log sensitive data.** Passwords, secrets, tokens, full PII, payment card data, and full request bodies must never appear in logs. Log identifiers (user ID, order ID), not values (email address, card number).
- **Log errors with context.** Include: error message and stack trace, correlation ID, and identifiers of the resources involved.

### Metrics

Prioritise:
1. Request/task throughput (operations per unit time)
2. Latency (p50, p95, p99 for I/O-bound operations)
3. Error rate (errors as a distinct count or label)
4. Queue/batch depth (for async systems)

Naming: use `snake_case`, prefix with the service name, suffix counters with `_total` and timers with `_duration_ms` or `_bytes`.

Avoid high-cardinality labels — `user_id`, `request_id`, and raw URL paths create metric cardinality explosions. Use bounded label values (`status=success|error`, `method=GET|POST`).

### Distributed Tracing

- Create or continue a trace span at every service boundary: incoming HTTP, outgoing HTTP, database query, message publish/consume
- Extract trace context from incoming requests (W3C `traceparent` header); inject into outgoing requests and async messages
- Name spans usefully: `GET /users/:id`, `db.query users`, `queue.publish order.created`
- Add attributes: `http.method`, `http.status_code`, `db.system`, `db.operation`, `error.type`, `error.message` on failure

### Health endpoints

Every network service must have a health endpoint. A health endpoint that always returns `200 OK` without checking dependencies is worse than useless — it masks failures.

Check:
- Database connectivity (a lightweight query)
- Cache reachability
- Any external dependency the service cannot function without

In environments that support it (e.g. Kubernetes), provide separate liveness (`/health/live`) and readiness (`/health/ready`) endpoints. A single `/health` is acceptable when the deployment environment does not distinguish them.

## Node.js / TypeScript stack

Use the **OpenTelemetry SDK** for metrics and traces — keeps instrumentation vendor-neutral.

Key packages: `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`, `@opentelemetry/exporter-otlp-http`, `@opentelemetry/exporter-prometheus`, `pino` (structured logging).

- Initialise the SDK before any other imports via `--import ./src/tracing.js` — never `import` it from application code
- Use `pino` with a `mixin` that injects the active OTel trace and span IDs into every log line
- Create child loggers at request boundaries to attach request-scoped fields
- Never use `console.log` in production paths
- Guard the OTLP trace exporter: only activate it when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, so local dev environments without a collector don't emit noisy errors
- Use `startActiveSpan` (not `startSpan`) for manual spans — it sets the span as active in async context
- Always call `span.end()` in a `finally` block; record exceptions on the span before re-throwing

## Severity reference

- `critical` — caught exception with no log/metric/rethrow; sensitive data in a log statement; network service with no health endpoint; background worker with zero error signal
- `major` — unstructured logging in request path; no correlation ID anywhere in request-scoped code; no latency measurement on I/O; health endpoint that always returns 200
- `minor` — log line missing useful context; wrong log level; high-cardinality metric label; span missing a useful attribute
