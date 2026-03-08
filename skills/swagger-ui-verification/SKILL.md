---
name: swagger-ui-verification
description: Verify that Swagger UI (or equivalent API documentation interface) is properly served and the raw OpenAPI spec is accessible over HTTP. Load when checking that API documentation is publicly available and functional.
license: MIT
compatibility: opencode
---

## Purpose

This skill verifies that API documentation is served correctly over HTTP. It checks two things: that a human-readable documentation UI (Swagger UI, Redoc, Scalar, etc.) is accessible, and that the raw OpenAPI spec file can be fetched programmatically.

## Prerequisites

The dev server must be running before these checks. If you are also loading the `openapi-spec-verification` skill, reuse the same running server — do not start a second one.

## Verifying the documentation UI

Check these common documentation endpoints in order:

```
GET /docs
GET /api-docs
GET /swagger
GET /reference
GET /docs/
GET /api/docs
```

At least one must return an HTML page. Verify:
- The response status is 200
- The response content type includes `text/html`
- The HTML body contains evidence of an API documentation interface (look for strings like `swagger-ui`, `redoc`, `scalar`, `openapi`, or `api-reference` in the HTML)

If none of these endpoints return a documentation UI, report as `major`. Include which endpoints were tried and what responses were received.

## Verifying raw spec access

Check these endpoints for the raw OpenAPI spec:

```
GET /openapi.yaml
GET /openapi.json
GET /docs/openapi.yaml
GET /docs/openapi.json
GET /api-docs/openapi.yaml
GET /api/openapi.yaml
GET /api/openapi.json
```

At least one must return a valid OpenAPI spec. Verify:
- The response status is 200
- The response is valid YAML or JSON
- The content contains an `openapi` version field (e.g., `openapi: "3.0.0"` or `"openapi": "3.1.0"`)
- The content contains a `paths` object with at least one path

If none of these endpoints return a valid spec, report as `major`.

## Consistency check

If both the documentation UI and raw spec are accessible, verify they reference the same spec. The documentation UI typically loads the spec from a URL — check that the URL it references matches one of the raw spec endpoints that returned a valid response.

If the documentation UI loads a spec from a different source than the file on disk, note this as `minor` — it may indicate a configuration issue where the served spec diverges from the source spec.

## What to ignore

- Visual styling or branding of the documentation UI — only verify it loads and works
- Authentication on the documentation endpoints — if the docs require auth, note it but do not flag it as an error (some teams intentionally protect their docs)
- Missing documentation UI is only a problem for projects that have HTTP endpoints. If the project is a library or CLI tool, this skill does not apply
