---
name: react-component-development
description: Use when building or refactoring React components with TypeScript. Covers component file structure, TypeScript props interfaces, data fetching with React Query (not useEffect+useState), state management choices, accessibility requirements, styling with design tokens, and writing tests with React Testing Library.
---

# React Component Development

## Overview

A React component is a pure, focused UI unit. It renders from props, owns only the state it must own, and is tested for behavior — not implementation. Follow these rules for every component you build.

---

## 1. File and folder structure

One component per file. Related files live in a folder:

```
UserCard/
├── index.ts          # re-exports UserCard
├── UserCard.tsx      # component
├── UserCard.test.tsx # tests
└── types.ts          # shared interfaces for this component tree
```

For page-level components with sub-components and data fetching, split further:

```
UserProfilePage/
├── index.ts
├── UserProfilePage.tsx   # page orchestrator — no JSX logic, just wires pieces
├── UserProfilePage.test.tsx
├── PostCard.tsx           # sub-component
├── PostCard.test.tsx
├── SettingsDropdown.tsx
├── SettingsDropdown.test.tsx
├── api.ts                 # fetch functions (validated — see below)
└── types.ts
```

Never put types, API calls, sub-components, and page logic all in one file. Each file has one job.

---

## 2. Props interface

Every component has an explicit TypeScript interface for its props. No implicit props, no `any`, no `object`.

```tsx
// types.ts
export interface UserCardProps {
  user: User
  initialFollowing?: boolean
  onFollowChange?: (userId: string, following: boolean) => void
}
```

Rules:
- Required props are necessary. Optional props have sensible defaults via destructuring.
- Prefer callbacks over passing dispatch or store references.
- Never use `React.FC` — it adds nothing useful and obscures return types.

---

## 3. Data fetching — always use React Query

Never use `useEffect` + `useState` for data fetching. This pattern requires manually managing loading state, error state, cancellation, deduplication, and caching. React Query handles all of this.

```tsx
// api.ts — validate at the boundary (never use `as SomeType`)
import { z } from 'zod'

const UserProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: z.string(),
  bio: z.string(),
  followerCount: z.number(),
})
export type UserProfile = z.infer<typeof UserProfileSchema>

export async function fetchUserProfile(userId: string): Promise<UserProfile> {
  const res = await fetch(`/api/users/${userId}`)
  if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`)
  return UserProfileSchema.parse(await res.json())
}

// UserProfilePage.tsx
import { useQuery } from '@tanstack/react-query'

function UserProfilePage({ userId }: { userId: string }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: () => fetchUserProfile(userId),
  })

  if (isPending) return <ProfileSkeleton />
  if (isError) return <ErrorMessage message={error.message} />
  return <ProfileContent profile={data} />
}
```

Rationale to reject:
- "This is simple, I don't need React Query" → Every `useEffect` fetch grows. Write it right the first time.
- "I'll add React Query later" → The manual pattern doesn't compose. Migrate is expensive.

---

## 4. Component structure

Keep components small and focused. If a component has more than one concern, split it.

```tsx
// Bad — does too much: fetches, transforms, renders layout, renders a form, manages multiple state slices
function UserPage() { ... }

// Good — orchestrates; each piece is independently understandable
function UserPage({ userId }: { userId: string }) {
  const { data, isPending, isError } = useQuery(...)
  if (isPending) return <UserSkeleton />
  if (isError) return <ErrorBanner />
  return (
    <main>
      <UserHeader user={data} />
      <UserPostList posts={data.posts} />
    </main>
  )
}
```

Never put logic in JSX. Extract conditionals and transformations before the return statement.

```tsx
// Bad
return <span>{user.followerCount === 1 ? 'follower' : 'followers'}</span>

// Good
const followerLabel = user.followerCount === 1 ? 'follower' : 'followers'
return <span>{followerLabel}</span>
```

---

## 5. State management

Use the right tool for the right state:

- **Local UI state** (open/closed, controlled input) → `useState`
- **Complex local state with multiple transitions** → `useReducer`
- **Shared UI state** (current user, theme, permissions) → React context or Zustand
- **Server state** → React Query — never replicate server state into `useState`

Do not reach for context or Zustand for state that one component owns. Do not put server state in `useState`.

---

## 6. Accessibility

Every interactive element must work with keyboard and screen reader. These are not optional.

- `<button>` for actions. `<a>` for navigation. Never `<div onClick>`.
- Toggle buttons: `aria-pressed={boolean}`.
- Dialogs: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus trapped inside, closes on Escape.
- Dropdown menus: trigger has `aria-haspopup="menu"` and `aria-expanded`, menu has `role="menu"`, items have `role="menuitem"`.
- Images: always provide meaningful `alt`. Decorative images: `alt=""`.
- Forms: `<label>` with `htmlFor` pointing to input `id`. Never use placeholder as label.
- Don't suppress `outline` without replacing it.

---

## 7. Styling

Never use hardcoded hex values or inline styles scattered across JSX. Use the project's design system tokens.

- **Business apps (Mantine)**: use Mantine's `p="md"`, `c="dimmed"`, `bg="gray.0"` — see `ui-design` skill
- **Consumer apps (Tailwind)**: use design tokens from `tailwind.config.ts`

Loading states use skeleton components (`<Skeleton />`), not spinner text like "Loading…".

---

## 8. Tests — write them. Every component.

Tests are not optional. Write the test file alongside the component. Do not leave "I'd test this by..." notes.

Use React Testing Library. Query by accessible role, label, or visible text:

```tsx
// UserCard.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserCard } from './UserCard'

const user = { id: '1', name: 'Jane', role: 'Engineer', avatarUrl: '/img.jpg' }

it('toggles follow state on button click', async () => {
  render(<UserCard user={user} />)
  await userEvent.click(screen.getByRole('button', { name: 'Follow Jane' }))
  expect(screen.getByRole('button', { name: 'Unfollow Jane' })).toBeInTheDocument()
})
```

Rules:
- Test behavior, not implementation. A test survives an internal refactor if the external contract is unchanged.
- Never use `getByTestId` or inspect internal state.
- Use `userEvent` (not `fireEvent`) for user interactions.
- Test all three data states: loading, error, and success. Mock `fetch` or the query function.

Rationalizations to reject:
- "The task only asked for the component" → Components ship with tests. Full stop.
- "It's a simple component, tests are overkill" → Simple components are the easiest to test. 30 seconds.
- "I'll add tests after" → Tests after prove what code does, not what it should do.

---

## Red flags — stop and reassess

- About to write `useEffect` + `useState` for data fetching → use React Query
- About to write `response.json() as SomeType` → validate with Zod
- Component file exceeds ~150 lines → probably doing too much; split it
- More than 3 boolean props on one component → consider composition instead
- About to skip writing tests → write them now
- Hardcoded hex values in JSX → use design tokens
- Using `div` or `span` with `onClick` for an action → use `<button>`
