# REST API Naming Conventions

## URL Structure

**Use lower-case kebab-case**:
- `GET /user-profiles` (Correct)
- `GET /UserProfiles` (Incorrect)
- `GET /user_profiles` (Incorrect)

**Resources are Nouns**:
- `POST /projects` (Correct)
- `POST /createProject` (Incorrect)
- `GET /projects` (Correct)
- `GET /getProjects` (Incorrect)

**Plural for Collections**:
- `GET /users` (Correct)
- `GET /user` (Incorrect - except for singleton resources like `/me`)
- `POST /users` (Correct)
- `POST /user` (Incorrect)

## Query Parameters

**Use camelCase**:
- `?sortBy=createdAt` (Correct)
- `?sort_by=created_at` (Incorrect)

**Standard Names**:
- `q`: Search query string
- `limit`: Max results per page
- `offset`: Starting index (0-based)
- `page`: Page number (1-based)
- `fields`: Comma-separated list of fields to include
- `embed`: Comma-separated list of related resources to include

## Request & Response JSON

**Use camelCase** (default):
- `createdAt` (Correct)
- `created_at` (Incorrect - unless project convention)
- `userId` (Correct)
- `user_id` (Incorrect - unless project convention)

**Exception**: If the existing project uses a different convention (e.g., `snake_case` in Python/Ruby/Go backends), follow the existing convention.
- Check existing API responses, models, or OpenAPI specs.
- If inconsistent, prefer `camelCase` for JSON APIs (standard for JS/TS clients).

## Versioning

**URL Versioning (Preferred)**:
- `GET /v1/users` (Major version only)
- `GET /v1.2/users` (Avoid minor versions unless critical)

**Header Versioning (Accept header)**:
- `Accept: application/vnd.myapi.v1+json`

**Do not mix**: Stick to one strategy.
