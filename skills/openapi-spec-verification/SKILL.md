---
name: openapi-spec-verification
description: Verify that OpenAPI spec files accurately reflect the running API. Covers spec-vs-reality comparison for endpoints, request/response shapes, and status codes. Load when validating that endpoint changes are reflected in the spec.
license: MIT
compatibility: opencode
---

## Purpose

This skill verifies that an OpenAPI specification file matches the actual behaviour of a running API. The spec is supposed to be the source of truth — this skill checks whether it actually is.

## Locating the spec file

Look for the spec in this order:
1. `openapi.yaml` or `openapi.json` in the project root
2. `docs/openapi.yaml` or `docs/openapi.json`
3. `api/openapi.yaml` or `api/openapi.json`

If no spec file exists, this is a `critical` issue. Every project with HTTP endpoints must have an OpenAPI spec.

## Starting the dev server

The API must be running to compare spec against reality. Start it with the project's dev command (typically `pnpm dev`) in the background. Wait for it to be ready by polling the base URL or a health endpoint — retry every 2 seconds for up to 30 seconds.

If the server does not start, report it as `critical` and stop. You cannot verify the spec without a running server.

Always stop the server when finished.

## Obtaining an authentication token

Many endpoints require a bearer token. Attempt to acquire one using this priority order — stop at the first that succeeds:

1. **Environment variable** — check `TEST_AUTH_TOKEN`, `API_TOKEN`, and `AUTH_TOKEN`.
2. **Local env files** — scan `.env.test`, `.env.local`, and `.env.example` for credential fields (email/username and password pairs).
3. **README credentials** — read the README for a "Local development" or "Test credentials" section. Per the project's testing conventions, seed data must include a user per auth role with credentials documented there. Use those credentials to call the auth endpoint documented in the spec (typically `POST /auth/login` or `POST /v1/token`) and exchange them for a token.
4. **Graceful degradation** — if no token can be obtained after exhausting the above, do not skip protected endpoints entirely. Instead, verify that each protected endpoint correctly returns `401` or `403` with no credentials, and confirm that status code is documented in the spec. This is itself a valid and useful assertion. List all endpoints that could not be fully verified in the output.

Never fabricate credentials or attempt to brute-force authentication.

## Verification steps

For each endpoint that was added or modified (based on the changed files list provided by build):

### 1. Endpoint exists in the spec

Check that the endpoint path and HTTP method are documented in the spec. If an endpoint exists in code but not in the spec, report as `major`.

### 2. Request shape matches

Compare the request body schema and query parameters documented in the spec against what the endpoint actually accepts. Send a valid request and confirm the spec's required fields, types, and constraints match.

### 3. Response shape matches

Compare the actual response JSON structure against the spec's response schema. Check:
- All fields in the response are documented in the spec
- Field types match (string, number, boolean, array, object)
- Nested object structures match
- Required fields are correctly marked

Report any mismatch as `major`.

### 4. Status codes match

For each endpoint, verify that the spec documents all status codes the endpoint can return. At minimum, check:
- The success status code (200, 201, 204)
- 400 for validation errors (if the endpoint accepts input)
- 401/403 for protected endpoints
- 404 for resource-specific endpoints

If the endpoint returns a status code not documented in the spec, report as `major`.

### 5. Authentication requirements match

If the endpoint requires authentication, the spec must document the security scheme. If the spec says an endpoint is public but the endpoint actually requires auth (or vice versa), report as `major`.

## What to ignore

- Minor formatting differences between spec and response (e.g., extra whitespace)
- Fields present in the response but marked as optional in the spec — these are acceptable
- Endpoints that were not changed in this task — only verify modified or new endpoints
