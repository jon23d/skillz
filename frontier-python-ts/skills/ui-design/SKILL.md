---
name: ui-design
description: React UI design principles and conventions for the Vite + React + Tailwind + shadcn/ui frontend in this harness. Load when building or modifying any user interface or React components. Covers visual standards, component decomposition, accessibility, responsiveness, state management, data fetching via TanStack Query, and in-app help patterns.
---

# UI Design

The frontend stack is fixed: **Vite + React + TypeScript + Tailwind CSS + shadcn/ui** (shadcn components are copied into `src/components/ui/`, built on Radix primitives). There is no Mantine, no Chakra, no Material UI. All visual decisions live within the Tailwind/shadcn ecosystem.

Stack-specific implementation details — installing shadcn components, the Tailwind config, the Vite project layout, the data-fetching architecture — live in the `shadcn-ui`, `tailwind`, and `vite-react` skills respectively. **This skill is about design discipline**, not about how to install a button.

---

## Visual standards

### Typography
- Three distinct sizes minimum: heading, body, label/caption. Body line height 1.5, headings 1.2–1.3.
- Constrain line length to 60–80 chars. Sequential heading hierarchy — never skip levels.
- Max three font weights per screen.
- Use Tailwind's typography scale (`text-sm`, `text-base`, `text-lg`, `text-xl`, ...) — never arbitrary values.

### Spacing
- Base-4 scale via Tailwind (`p-1` = 4px, `p-2` = 8px, `p-4` = 16px, ...). No arbitrary values like `p-[13px]`.
- Related elements closer than unrelated. Consistent padding inside containers.

### Colour
- Use the **shadcn/ui CSS variable tokens** (`bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`, `border-border`, `bg-muted`, `text-muted-foreground`, `bg-destructive`). Never hardcoded hex values, never raw Tailwind colour utilities like `bg-blue-500` for app surfaces.
- One primary action colour (the `primary` token), consistent for all primary buttons.
- Background/surface/border form clear hierarchy via the token set. Never colour alone for meaning — pair with icon/label.
- WCAG AA: 4.5:1 body text, 3:1 large text and UI components. The default shadcn token set already meets this; if you customize the palette, re-check.

### Visual hierarchy
- One primary action per screen, visually dominant. Most important content has most visual weight.
- Decorative elements are subtle. Whitespace is structure.

### Interactive elements
- Four explicit states: default, hover, focus, disabled. Focus always visible (shadcn's `focus-visible:ring` defaults are fine — do not strip them).
- Primary buttons filled (`<Button>`), secondary outlined (`variant="outline"`), ghost (`variant="ghost"`), destructive (`variant="destructive"`). Min 44×44px touch targets.

### Forms
- Every input has a visible label above it (use shadcn's `<Form>`/`<FormField>`/`<FormLabel>` components — they wire up `aria-describedby` and validation messages for you).
- Validation errors adjacent to the field (`<FormMessage>`).
- Required fields marked consistently. Submit buttons disabled/loading during requests.
- Form state via `react-hook-form` + `zod` resolver. See the `shadcn-ui` skill for the canonical pattern.

### Feedback
- Scoped loading indicators (shadcn `<Skeleton>`), not full-page spinners. Specific success/error messages.
- Toasts via `sonner` (the shadcn-recommended toast library), not banners or alert boxes for transient feedback.
- Destructive actions require confirmation naming the thing being destroyed — use the shadcn `<AlertDialog>`.

---

## Component design

**One component, one responsibility.** A component file should not exceed 150 lines.

### Decomposition rules

**Separate data from presentation.** A component that calls `useQuery`/`useMutation` should not contain complex JSX — extract data-fetching into a custom hook (or call the hook at the top of a page component) and render focused children.

```tsx
// Good — hook owns data, page composes focused children
function useUserDashboard() {
  const user = useQuery({ queryKey: userKeys.me, queryFn: fetchMe })
  const projects = useQuery({ queryKey: projectKeys.all, queryFn: fetchProjects })
  return { user, projects }
}

function UserDashboard() {
  const { user, projects } = useUserDashboard()
  return (
    <div className="flex flex-col gap-6">
      <UserHeader user={user.data} isLoading={user.isLoading} />
      <ProjectList projects={projects.data} isLoading={projects.isLoading} />
    </div>
  )
}
```

**Extract every visually distinct section as its own component.** More than 3 `useState` calls is a smell. JSX nesting deeper than 3 levels means you missed an extraction.

### File structure

One component per file. Related files in a folder:

```
UserCard/
├── index.ts
├── UserCard.tsx
├── UserCard.test.tsx
└── types.ts
```

### Props

Explicit TypeScript interfaces. Required props are necessary, optional have defaults. Prefer callbacks over store references. Never use `React.FC`. Never hand-write types for API shapes — derive from `components["schemas"]` (see the `openapi-codegen` skill).

### Composition over configuration

Prefer composing smaller components over boolean flag props (`showHeader`, `compact`, `withBorder`).

### Never put logic in JSX

Extract conditionals and transformations into variables before the return statement.

### Use shadcn components before building custom

Before reaching for a hand-built primitive, check whether shadcn ships one (`Button`, `Input`, `Select`, `Dialog`, `DropdownMenu`, `Tabs`, `Table`, `Form`, `Sheet`, `Tooltip`, `Popover`, `Toast`/Sonner, `AlertDialog`, `Card`, `Badge`, ...). Copy it into `src/components/ui/` via the CLI; do not paste in unverified copies. Customize via `cn(...)` and Tailwind utilities, not by editing the primitive's structure.

---

## Data fetching — always use TanStack Query against the typed client

Never use `useEffect` + `useState` for data fetching.

- **Generated client first.** API calls go through `apiClient` from `src/api/client.ts`, which is bound to types generated by `openapi-typescript` from FastAPI's `/openapi.json`. See the `openapi-codegen` skill.
- **Service layer wraps the client.** `src/services/*.ts` exposes typed functions that throw on error. Components and hooks call services, never the raw client.
- **Custom hooks as the interface.** Components call hooks (or inline `useQuery` for one-shots), not services directly. Hooks use TanStack Query internally.
- **No hardcoded URLs.** Endpoint definitions live in the generated client only.
- **No `as SomeType` casts** — the generated types are the contract; if they're wrong, fix the backend, then rerun codegen.

---

## State management

- **Local UI state** → `useState` or `useReducer`
- **Form state** → `react-hook-form` (the shadcn `<Form>` wraps it)
- **Shared UI state** → React context or Zustand (context for infrequent changes, Zustand for frequent)
- **Server state** → TanStack Query. Never replicate into `useState`.
- **URL state** → React Router v7 (search params, route params). Never duplicate URL state into local state.
- Do not reach for Redux.

---

## Tailwind + shadcn conventions

- Tailwind utility classes exclusively. No CSS Modules, no styled-components, no inline `style` props for anything that has a Tailwind equivalent.
- Use the shadcn token classes (`bg-background`, `text-foreground`, etc.) instead of raw colour utilities.
- Compose conditional classes with `cn()` from `@/lib/utils` (shipped by the shadcn CLI) — never string-concat class names.
- Class ordering enforced by `prettier-plugin-tailwindcss`.
- Dark mode via the `dark:` prefix and the `class` strategy — already wired by the shadcn init.

See the `tailwind` and `shadcn-ui` skills for the full setup.

---

## Accessibility

- All images have meaningful `alt` text. Decorative: `alt=""`.
- Form inputs have associated labels (use shadcn's `<FormLabel>` — it wires `htmlFor` automatically). Interactive non-native elements have `role` and `aria-*`.
- Colour never sole means of information. Focus states always visible. Semantic HTML.
- `<button>` (or shadcn `<Button>`) for actions, `<a>` (or React Router `<Link>`) for navigation. Never `<div onClick>`.
- Toggle buttons: `aria-pressed`. Dialogs: use shadcn `<Dialog>`/`<AlertDialog>` — they trap focus, handle Escape, and set `role="dialog"` for you.

---

## Responsiveness

Design mobile first. Tailwind's mobile-first breakpoint prefixes (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`) — base styles apply to mobile, prefixes apply at the breakpoint and up. No hardcoded widths for content containers; prefer `max-w-*` constraints.

---

## Loading, error, and empty states

Every data-dependent component handles three states: loading, error, success.
- **Loading:** shadcn `<Skeleton>` matching the final layout. Not a centered spinner.
- **Error:** specific message and a retry control. TanStack Query exposes `refetch()`.
- **Empty:** specific to the entity, explains what it is, offers a primary action to create the first one. Never generic "Nothing here yet".

---

## In-app help patterns

### Tooltips
shadcn `<Tooltip>` for one-sentence explanations of controls and icons. Triggers on hover and keyboard focus. 300–500ms delay. Never put critical info only in a tooltip (invisible on touch).

### Help icons and popovers
shadcn `<Popover>` for 2–4 sentence inline explanations of non-obvious form fields. Place after the field label. Keyboard-accessible by default.

### Field-level help text
Use shadcn's `<FormDescription>` beneath inputs with non-obvious purpose. Distinct from `<FormMessage>` (validation errors). Concise.

### Empty states as onboarding
Icon/illustration, specific heading, 1–2 sentences explaining the entity, primary action button to create the first item. Never generic.

---

## Screenshots

After completing UI changes, take screenshots from e2e tests (not separate scripts). Add `page.screenshot()` calls into Playwright tests, then **remove before committing**. Cover: default state, interaction states, validation errors, success, mobile viewport when relevant. Name as `route_state-description_viewport.png`. See the `playwright-e2e` skill.

---

## Tests — every component

Use React Testing Library + Vitest. Query by accessible role, label, or visible text — never `getByTestId`. Use `userEvent`. Test loading, error, success states. Domain objects from test factories built on `components["schemas"]` types — no inline literals. See the `tdd` skill.

## Red flags — stop and reassess

- `useEffect` + `useState` for data fetching → use TanStack Query
- `await fetch("/api/...")` in a component → use the generated `apiClient` via a service
- `as SomeType` for an API response → the generated types are the contract; fix the backend instead
- `interface User { ... }` hand-written for an API shape → use `components["schemas"]["User"]`
- Component exceeds 150 lines → split
- More than 3 boolean props → consider composition
- Hardcoded hex values or `bg-blue-500` for app surfaces → use shadcn tokens
- Editing a file in `src/components/ui/` to change the structure → wrong layer; wrap it in your own component
- `div`/`span` with `onClick` → use `<button>` / shadcn `<Button>`
- About to skip tests → write them now
