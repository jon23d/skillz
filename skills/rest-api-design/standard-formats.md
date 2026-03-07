# Standard Formats & Envelopes

## Pagination

Use a consistent `meta` envelope for pagination metadata.

### Request
```
GET /v1/users?page=2&limit=20
GET /v1/users?cursor=xyz&limit=20
```

### Response
```json
{
  "data": [
    { ...user1... },
    { ...user2... }
  ],
  "meta": {
    "pagination": {
      "total": 100,       // Total records matching query
      "count": 20,        // Records in this response
      "perPage": 20,      // Requested limit
      "currentPage": 2,   // Current page number
      "totalPages": 5,    // Total pages available
      "links": {
        "next": "https://api.example.com/v1/users?page=3",
        "prev": "https://api.example.com/v1/users?page=1"
      }
    }
  }
}
```

## Envelope Pattern

Avoid naked array responses. Always wrap collections in a `data` key.

### Bad
```json
[
  { "id": 1 },
  { "id": 2 }
]
```

### Good
```json
{
  "data": [
    { "id": 1 },
    { "id": 2 }
  ]
}
```

## Dates and Times

Always use ISO 8601 UTC strings.

### Format
`YYYY-MM-DDTHH:mm:ss.sssZ`

### Example
`"createdAt": "2023-10-27T14:30:00.000Z"`

- Always UTC (Z suffix)
- Milliseconds optional but recommended
- Never use local time
- Never use epoch seconds (ambiguous units, unreadable)

## Resource Identifiers

Use string-based IDs (UUIDs or HashIDs) for public interfaces to prevent enumeration attacks.

### Example
`"id": "usr_123abc"` (Stripe-style prefixed IDs are excellent for debugging)

- Avoid sequential integers (`"id": 1`) if possible.
- If using integers internally, consider HashIDs for the API layer.
