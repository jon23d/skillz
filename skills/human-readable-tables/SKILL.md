---
name: human-readable-tables
description: Use when writing documentation that contains tables — API references, config options, CLI flags, or any structured data — and the output needs to be readable in raw markdown, not just rendered HTML.
---

# Human-Readable Tables

## Overview
Tables in documentation must be readable in raw markdown, not just when rendered. Unpadded cells, stuffed descriptions, and redundant columns all hurt human readers.

## Rules

**Pad all columns to uniform width.**
Every cell in a column should be the same width as the widest cell in that column. Use spaces to pad. This makes the raw file scannable without a renderer.

```
| Parameter | Type   | Description                  |
|-----------|--------|------------------------------|
| `page`    | int    | Page number. Defaults to 1.  |
| `limit`   | int    | Results per page.            |
```

**Don't use a table for one row.**
A single-row table adds visual overhead with no benefit. Use a definition list or inline prose instead.

```
# Instead of this:
| Parameter | Type   | Description     |
|-----------|--------|-----------------|
| `id`      | string | The user's ID.  |

# Write this:
**`id`** (string, required) — The user's ID.
```

**Drop columns that carry no information.**
If every row in the "Required" column says "Yes", remove the column. State requirements in the description or section heading instead.

**Keep description cells short — split long descriptions.**
If a description exceeds ~80 characters, shorten it or move the detail to prose below the table. Never let one cell span a very long line.

```
# Avoid:
| `active` | bool | When true, returns only active sessions. When false, returns only inactive sessions. Omit to return all. |

# Prefer:
| `active` | bool | Filter sessions by active status. |

When `true`: active sessions only. When `false`: inactive only. Omit for all.
```

**Be consistent within a document.**
All parameter tables of the same type (e.g. path params, query params, body fields) should use the same columns and column order throughout the document.

## Common mistakes

- Inconsistent padding between sections for the same data type
- "Required" column present when it's always "Yes" (path params)
- Long description sentences stuffed in a cell
- Single-row tables for path parameters that only have `id`
