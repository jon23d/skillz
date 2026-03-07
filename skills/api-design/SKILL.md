---
name: api-design
description: Use when designing, reviewing, or extending HTTP APIs — choosing resource shape, status codes, versioning, pagination, error formats, or authentication schemes.
---

# API Design

## Philosophy

An API is a contract with its consumers. Breaking changes are expensive. Design for clarity, consistency, and evolvability from the start.

## Resource modeling

- Name resources as plural nouns: `/users`, `/orders`, `/invoices`
- Nest only one level deep for ownership: `/users/{id}/orders` is fine; `/users/{id}/orders/{id}/items` is too deep — flatten to `/order-items?order_id=`
- Never use verbs in paths — use the HTTP method: `DELETE /sessions/{id}`, not `POST /logout`
- Resource identifiers in paths are opaque strings (cuid, uuid), never sequential integers

## HTTP methods and status codes

- `GET` — read, safe, idempotent; never has a body
- `POST` — create or trigger action; returns `201 Created` with `Location` header for creates, `200` for actions
- `PUT` — full replacement, idempotent
- `PATCH` — partial update
- `DELETE` — remove; returns `204 No Content` on success

Status codes:
- `200` — success with body
- `201` — resource created
- `204` — success, no body
- `400` — client validation error (bad input)
- `401` — not authenticated
- `403` — authenticated but not authorized
- `404` — resource not found
- `409` — conflict (duplicate, state violation)
- `422` — semantically invalid (passes schema, fails business rule)
- `429` — rate limited
- `500` — unexpected server error (never expose stack traces)

## Error format

Consistent error shape across every endpoint:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "fields": [
      { "field": "email", "message": "Must be a valid email address" }
    ]
  }
}
```

- `code` is a machine-readable enum (never a number)
- `message` is safe to display; never include internal details
- `fields` is present only for validation errors — use `fields`, not `details` or `errors`, for consistency across all endpoints

## Request validation

Validate and reject bad input at the boundary — before any business logic runs. Use a schema library (zod, joi, JSON Schema, Pydantic, etc.). Return `400` with field-level errors immediately.

Use `400` for all input validation failures including field format errors (invalid email, missing required field, wrong type). Reserve `422` for cases where input is structurally valid but violates a business rule (e.g. a date range where end is before start).

Never pass unvalidated input to a database query or downstream service.

## Versioning

- Version in the URL path: `/v1/`, `/v2/`
- Never version individual endpoints — version the whole API surface
- A new major version is needed when a breaking change cannot be avoided
- Support the previous major version for at least one deprecation cycle; document the sunset date

Breaking changes: removing a field, changing a field type, changing a status code, making an optional field required.
Non-breaking: adding a new optional field, adding a new endpoint, adding a new optional query parameter.

## Pagination

For collections that can grow unbounded, always paginate. Prefer cursor-based pagination over offset for large datasets (offsets are unstable under concurrent writes).

```json
{
  "data": [...],
  "pagination": {
    "cursor": "eyJpZCI6IjEyMyJ9",
    "has_more": true
  }
}
```

Include `limit` (default 20, max 100) and `cursor` query parameters.

## Authentication

- Prefer bearer tokens (JWT or opaque) over API keys for user-facing APIs
- API keys are acceptable for server-to-server integrations
- Always use HTTPS — never transmit credentials over HTTP
- Document the authentication scheme in the OpenAPI spec

## OpenAPI spec

Every HTTP API must have an OpenAPI 3.x spec (`openapi.yaml` at the project root or `docs/openapi.yaml`). The spec is the contract — keep it in sync with the implementation. See `openapi-spec-verification` skill.

## Checklist

Before shipping any new endpoint:
- [ ] Path uses nouns, not verbs
- [ ] Correct HTTP method and status code
- [ ] Input validated with field-level errors on `400`
- [ ] Error response follows the standard shape
- [ ] Endpoint documented in the OpenAPI spec
- [ ] Auth requirements documented and enforced
- [ ] No stack traces or internal details in error responses
