---
name: swagger-ui-verification
description: Use when verifying that API documentation (Swagger UI, Redoc, Scalar, or equivalent) is correctly served and the raw OpenAPI spec is accessible over HTTP.
---

# Swagger UI Verification

## Purpose

Verify two things: that a human-readable API documentation UI is accessible, and that the raw OpenAPI spec can be fetched programmatically.

## Prerequisites

The dev server must be running before these checks. If you are also running `openapi-spec-verification`, reuse the same server — do not start a second one.

## Verify the documentation UI

Check these endpoints in order until one returns a documentation UI:

```
GET /docs
GET /api-docs
GET /swagger
GET /reference
GET /docs/
GET /api/docs
```

A passing UI response must:
- Return status `200`
- Have `Content-Type` containing `text/html`
- Contain evidence of an API documentation interface in the HTML body (strings like `swagger-ui`, `redoc`, `scalar`, `openapi`, or `api-reference`)

If none of these endpoints return a documentation UI, report as `major`. Include which endpoints were tried and what responses were received.

## Verify raw spec access

Check these endpoints until one returns a valid spec:

```
GET /openapi.yaml
GET /openapi.json
GET /docs/openapi.yaml
GET /docs/openapi.json
GET /api-docs/openapi.yaml
GET /api/openapi.yaml
GET /api/openapi.json
```

A passing spec response must:
- Return status `200`
- Be valid YAML or JSON
- Contain an `openapi` version field (e.g. `openapi: "3.0.0"`)
- Contain a `paths` object with at least one path

If none return a valid spec, report as `major`.

## Consistency check

If both the UI and raw spec are accessible, verify they reference the same spec. The documentation UI typically loads the spec from a URL — confirm that URL matches one of the raw spec endpoints that returned a valid response.

If the UI loads from a different source than the file on disk, note as `minor` — it may indicate the served spec diverges from the source spec.

## What to ignore

- Visual styling or branding of the documentation UI
- Authentication on documentation endpoints — note it but do not flag as an error
- This skill does not apply to library or CLI projects with no HTTP endpoints
