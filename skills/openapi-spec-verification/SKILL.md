---
name: openapi-spec-verification
description: Use when validating that an OpenAPI spec file accurately reflects the running API — checking endpoint existence, request/response shapes, status codes, and authentication requirements.
---

# OpenAPI Spec Verification

## Purpose

Verify that the OpenAPI specification matches the actual behaviour of the running API. The spec is supposed to be the source of truth — this skill checks whether it actually is.

## Locating the spec file

Check in this order:
1. `openapi.yaml` or `openapi.json` at the project root
2. `docs/openapi.yaml` or `docs/openapi.json`
3. `api/openapi.yaml` or `api/openapi.json`

If no spec file exists, report as `critical`. Every project with HTTP endpoints must have an OpenAPI spec.

## Starting the dev server

The API must be running to compare spec against reality. Start it with the project's dev command in the background. Wait by polling the base URL or health endpoint — retry every 2 seconds for up to 30 seconds.

If the server does not start, report it as `critical` and stop. Always stop the server when finished.

## Obtaining an authentication token

Try in this order, stopping at the first that succeeds:
1. Environment variables: `TEST_AUTH_TOKEN`, `API_TOKEN`, `AUTH_TOKEN`
2. `.env.test`, `.env.local`, `.env.example` — look for credential fields
3. README — look for a "Local development" or "Test credentials" section; use those credentials with the auth endpoint documented in the spec
4. If no token can be obtained, verify that protected endpoints correctly return `401` or `403` with no credentials and confirm that status code is documented in the spec

Never fabricate credentials or attempt to brute-force authentication.

## Verification steps (for each changed endpoint)

**1. Endpoint exists in the spec** — if an endpoint exists in code but not in the spec, report as `major`.

**2. Request shape matches** — compare the request body schema and query parameters in the spec against what the endpoint actually accepts. Send a valid request and confirm required fields, types, and constraints match.

**3. Response shape matches** — compare the actual response JSON against the spec's response schema:
- All fields in the response are documented
- Field types match
- Nested structures match
- Required fields are correctly marked

Report any mismatch as `major`.

**4. Status codes match** — for each endpoint, verify the spec documents all returned status codes. At minimum check:
- Success code (200, 201, 204)
- 400 for validation errors (if the endpoint accepts input)
- 401/403 for protected endpoints
- 404 for resource-specific endpoints

Undocumented status codes: report as `major`.

**5. Authentication requirements match** — if the spec says an endpoint is public but it actually requires auth (or vice versa), report as `major`.

## What to ignore

- Minor formatting differences
- Fields present in the response but marked optional in the spec — acceptable
- Endpoints not changed in this task — only verify modified or new endpoints
