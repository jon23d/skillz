# Standard Error Responses (RFC 7807)

## Error Format

Always use a consistent error object in the response body.

```json
{
  "type": "about:blank",  // URI identifier for the error type (optional)
  "title": "Invalid Request", // Short, human-readable summary
  "status": 400,          // HTTP status code
  "detail": "Email is required.", // Specific explanation
  "instance": "/v1/users", // URI where error occurred (optional)
  "errors": [             // Optional field for validation errors
    {
      "field": "email",
      "message": "Must be a valid email address"
    }
  ]
}
```

## Standard Status Codes

### Success (2xx)
| Code | Name | Use Case |
|------|------|----------|
| 200 | OK | Standard successful response |
| 201 | Created | Resource successfully created (with `Location` header) |
| 202 | Accepted | Request accepted for async processing |
| 204 | No Content | Successful deletion or update with no response body |

### Client Error (4xx)
| Code | Name | Use Case |
|------|------|----------|
| 400 | Bad Request | Malformed syntax or invalid validation (catch-all) |
| 401 | Unauthorized | Authentication required or invalid |
| 403 | Forbidden | Authenticated but not authorized for this resource |
| 404 | Not Found | Resource does not exist |
| 405 | Method Not Allowed | URL exists but HTTP method is wrong |
| 409 | Conflict | State conflict (e.g., duplicate unique field) |
| 422 | Unprocessable Entity | Semantically incorrect (validation errors) |
| 429 | Too Many Requests | Rate limit exceeded |

### Server Error (5xx)
| Code | Name | Use Case |
|------|------|----------|
| 500 | Internal Server Error | Generic server failure |
| 503 | Service Unavailable | Maintenance or overload |
