---
name: rest-api-design
description: Use when designing, reviewing, or documenting HTTP REST API endpoints, resources, contracts, or schemas.
---

# REST API Design

## Overview
Enforces strict resource-oriented design, standard HTTP semantics, and predictable contract patterns.

## When to use
- Designing new API endpoints or resources
- Refactoring existing APIs
- Reviewing API pull requests
- Writing OpenAPI/Swagger specifications
- Debugging inconsistent API behavior

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
1.  **Field Update (Preferred)**: `PATCH /articles/{id}` with `{ "status": "published" }`
2.  **Sub-resource Creation**: `PUT /articles/{id}/publication` (Idempotent creation of a "publication" state)
3.  **Controller Resource**: `POST /articles/{id}/actions/publish` (Last resort for complex side effects)

## Reference & Standards

For detailed standards on specific topics, see:

- [Error Codes & Responses](error-codes.md)
- [Naming Conventions](naming-conventions.md)
- [Pagination & Formats](standard-formats.md)

## Common Mistakes

**Mistake**: Returning `200 OK` for errors with `{ "error": "failed" }`
**Fix**: Use 4xx for client errors, 5xx for server errors.

**Mistake**: Using `POST` for updates because it's "easier"
**Fix**: Use `PATCH` for partial updates, `PUT` for replacements.

**Mistake**: Trailing slashes
**Fix**: Remove trailing slashes. `/users` (correct) vs `/users/` (incorrect).

**Mistake**: Versioning in headers only
**Fix**: Put version in URL for browsability. `GET /v1/users`
