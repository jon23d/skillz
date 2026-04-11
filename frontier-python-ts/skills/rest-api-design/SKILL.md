---
name: rest-api-design
description: Use when designing, reviewing, or documenting HTTP REST API endpoints, resources, contracts, or schemas.
---

# REST API Design

## Core Principles

### 1. Resource Orientation
- **Nouns, not Verbs**: `/users`, `/orders`. Never `/createUser` or `/getOrders`.
- **Plural Roots**: Always use plural nouns for collections: `/users`, not `/user`.
- **Kebab-case URLs**: `/pending-orders`, not `/pendingOrders` or `/PendingOrders`.

### 2. HTTP Verbs & Semantics
| Method | Use Case | Idempotent? | Safe? |
|--------|----------|-------------|-------|
| `GET` | Read resources | Yes | Yes |
| `POST` | Create new resource | No | No |
| `PUT` | Replace complete resource | Yes | No |
| `PATCH` | Partial update | No | No |
| `DELETE` | Remove resource | Yes | No |

### 3. Nesting & Relationships
- **Creation**: Use nesting for ownership. `POST /projects/{id}/tasks`
- **Retrieval**: Prefer flat resources for speed if ID is unique. `GET /tasks/{taskId}`
- **Limit Depth**: Max 2 levels deep. `/orgs/{id}/repos/{id}/issues` is the limit.

### 4. Actions & Non-CRUD
For operations that don't fit CRUD (e.g., "publish", "ban", "archive"):
1. **Field Update (Preferred)**: `PATCH /articles/{id}` with `{ "status": "published" }`
2. **Sub-resource Creation**: `PUT /articles/{id}/publication`
3. **Controller Resource**: `POST /articles/{id}/actions/publish` (last resort)

---

## Naming Conventions

### URL Structure
- Lower-case kebab-case: `GET /user-profiles`
- Resources are nouns: `POST /projects` (not `POST /createProject`)
- Plural for collections: `GET /users` (except singletons like `/me`)

### Query Parameters (camelCase)
- `q`: Search query string
- `limit`: Max results per page
- `offset`: Starting index (0-based)
- `page`: Page number (1-based)
- `fields`: Comma-separated list of fields to include
- `embed`: Comma-separated list of related resources to include
- `sortBy`: Sort field name

### Request & Response JSON (snake_case in this harness)
- This harness uses `snake_case` field names in JSON (`created_at`, `user_id`). That is the FastAPI + Pydantic default and it matches the SQLAlchemy model field names, which keeps the serialisation layer thin.
- The frontend consumes these names directly via the generated types from `openapi-typescript` — there is **no** camelCase translation layer. See the `openapi-codegen` skill.
- Do not use Pydantic `alias_generator=to_camel` to "translate" at the API edge. It creates two names for the same field (DB vs wire) and the cost compounds.

### Versioning
- **URL Versioning (Preferred)**: `GET /v1/users`
- **Header Versioning**: `Accept: application/vnd.myapi.v1+json`
- Do not mix strategies.

---

## Standard Formats & Envelopes

### Pagination
```json
{
  "data": [ ...items... ],
  "meta": {
    "pagination": {
      "total": 100,
      "count": 20,
      "perPage": 20,
      "currentPage": 2,
      "totalPages": 5,
      "links": {
        "next": "https://api.example.com/v1/users?page=3",
        "prev": "https://api.example.com/v1/users?page=1"
      }
    }
  }
}
```

### Envelope Pattern
Always wrap collections in a `data` key. Never return naked arrays.

### Dates and Times
ISO 8601 UTC: `"createdAt": "2023-10-27T14:30:00.000Z"`. Always UTC (Z suffix). Never epoch seconds.

### Resource Identifiers
String-based IDs (UUIDs or prefixed IDs like `usr_123abc`) to prevent enumeration. Avoid sequential integers for public interfaces.

---

## Error Responses (RFC 7807)

```json
{
  "type": "about:blank",
  "title": "Invalid Request",
  "status": 400,
  "detail": "Email is required.",
  "instance": "/v1/users",
  "errors": [
    { "field": "email", "message": "Must be a valid email address" }
  ]
}
```

### Standard Status Codes

**Success (2xx):** 200 OK, 201 Created (with `Location` header), 202 Accepted (async), 204 No Content (deletion/update with no body).

**Client Error (4xx):** 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 405 Method Not Allowed, 409 Conflict, 422 Unprocessable Entity, 429 Too Many Requests.

**Server Error (5xx):** 500 Internal Server Error, 503 Service Unavailable.

---

## FastAPI specifics

The universal rules above describe **what** to ship. FastAPI is **how** to ship it in this harness. The `fastapi`, `pydantic`, and `openapi-codegen` skills cover the details; the load-bearing rules that affect API design are:

- **`response_model=` is mandatory** on every route. It populates `/openapi.json`, strips fields that aren't in the schema, and is the contract the frontend regenerates its types from. A route without `response_model` ships `unknown` to the frontend.
- **`status_code=` is explicit**. Default is `200` — set `201` for create, `204` for delete-with-no-body, `202` for async-accepted.
- **`operation_id=` is stable**. The generated frontend client method names are derived from this; a refactor that renames the handler function silently changes the client's method names unless `operation_id` is pinned.
- **`tags=[...]` on the router** — groups the OpenAPI spec by resource.
- **`responses={401: {...}, 404: {...}, ...}`** — document every non-success status code the frontend needs to handle. Undocumented codes are a contract bug.
- **Errors** — raise `HTTPException(status_code=..., detail="...")` for the happy-path cases. For RFC 7807 conformance with field-level errors, use a shared `ErrorResponse` Pydantic model and register an exception handler that returns it.
- **Validation errors** — FastAPI's default 422 with Pydantic's error list is acceptable here. Don't try to remap it to 400; the frontend can handle both.
- **Routes never read `tenant_id`, `user_id`, or `role` from the request body** — only from dependencies (`get_current_user`, `get_tenant_db`). See the `multi-tenancy` skill.

## Common Mistakes

- Returning `200 OK` for errors → use 4xx/5xx
- Using `POST` for updates → use `PATCH`/`PUT`
- Trailing slashes → remove them
- Versioning in headers only → put version in URL
- **Omitting `response_model=`** → the OpenAPI spec has no success-response schema, and the generated frontend client gets `unknown` everywhere
- **Omitting `operation_id=`** → frontend client method names depend on FastAPI's defaults and silently change when you rename a handler
- **`alias_generator=to_camel` on the response schema** → creates two names for the same field; pick snake_case and stick with it
