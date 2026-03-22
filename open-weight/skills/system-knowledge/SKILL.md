---
name: system-knowledge
description: Use when an agent needs to understand how the application behaves before writing tickets, scoping features, or describing current functionality. Use when docs/ domain files exist or need to be bootstrapped from existing issues or stories.
---

# System Knowledge

## Overview

Behavioral understanding of the application lives in `docs/` as plain-prose domain files — not in source code. Read these files instead of exploring the codebase. They describe *what the system does now*, written for a product role, not an engineering role.

## When to use

- Before decomposing any ticket — to understand the current behavior the ticket modifies or extends
- When scoping work — to know what already exists and what would be new
- Do not read source code to understand system behavior. The `docs/` files are the source of truth.

## Domain file structure

Each file covers one domain of the application. Use this hierarchy:

```
# Domain Name

## Feature Name
Brief description of what this feature does for users.

### Current behavior
- Rule or flow, stated plainly: "Users must verify their email before logging in for the first time."
- Another rule: "Magic links expire after 15 minutes."

### User flows
- Flow name: step → step → outcome
```

Files live at `docs/<domain>.md`. Examples: `docs/auth.md`, `docs/checkout.md`, `docs/notifications.md`.

These files are updated after implementation by `@developer-advocate`. Do not update them yourself.

## Workflow: reading before decomposing a ticket

1. List files in `docs/` to find relevant domains
2. Read the domain file(s) that overlap with the ticket topic
3. Identify the specific feature or rule the ticket changes
4. Draft the new behavior in plain prose — this forces precision and feeds directly into acceptance criteria. Hold this draft as part of your extracted ticket context. **Do not write to or modify any `docs/` file.** `docs/` reflects what the system does now. Writing future behavior into it before implementation pollutes the source of truth.
5. Proceed to decomposition, grounded in that draft

Writing out the new behavior in plain prose before decomposing is not optional — it clarifies what the acceptance criteria should actually say.

## Bootstrapping: when docs/ doesn't exist or is insufficient

If `docs/` is missing or empty, stop. Report to the user:

> "There are no behavioral docs in this project. The `docs/` directory needs to be seeded before tickets can be written against it. Please seed it manually or confirm you want to proceed without behavioral context."

Do not decompose a ticket until the relevant domain file exists and covers the behavior being changed.

**A thin doc is the same as no doc.** If the relevant domain file exists but does not cover the behavior the ticket changes or adds, treat it as a gap. Ask the user the specific product questions needed to fill it. Do not invent answers.

## No invented behavior — ever

Do not treat undocumented behavior as a product decision you can make. This applies even when:

- The user says "use reasonable defaults"
- There is time pressure
- The answer seems obvious

"Reasonable defaults" for product behavior are product decisions. Inventing them and writing them into the doc as fact launders assumptions into a false source of truth. A developer will implement those invented defaults without knowing they were never specified.

When the doc is insufficient, ask the user the specific questions needed. Keep questions concrete and few. Example:

> "docs/billing.md doesn't cover coupons. Before I decompose this ticket I need three things from you: (1) what discount types should be supported — percentage, fixed amount, or both? (2) can multiple coupons stack on one order? (3) what should a user see when they enter an invalid or expired code?"

Do not ask questions that engineering should decide. Ask only questions whose answers are product decisions.

## Example domain file

```markdown
# Authentication

## Login
Users authenticate via magic link. Password login is not supported.

### Current behavior
- Users enter their email address on the login screen
- The system sends a magic link to that address immediately
- Magic links expire after 15 minutes
- Clicking an expired link shows an inline error: "This link has expired. Request a new one."
- A user may only have one active magic link at a time; requesting a new one invalidates the previous

### User flows
- Standard login: enter email → receive email → click link → authenticated and redirected to dashboard
- Expired link: click link → error screen → option to request new link

## Session Management

### Current behavior
- Sessions last 30 days unless the user logs out
- Logging out on one device does not invalidate sessions on other devices
```
