---
name: ui-design
description: Use when building or modifying any user interface — covering component design, styling system selection, accessibility, responsiveness, state management, and in-app help patterns.
---

# UI Design

## Determine application type first

Before writing any UI code, determine whether this is a **business-facing** or **consumer-facing** application.

**Business-facing** (internal tools, dashboards, admin panels, B2B SaaS, data-heavy interfaces):
- Use **Mantine** as the component library
- Style using Mantine's styling system
- Do not introduce Tailwind

**Consumer-facing** (marketing sites, consumer products, public-facing apps, brand-driven experiences):
- Use **Tailwind CSS** for all styling
- Use **Radix UI** for unstyled accessible primitives (dialogs, dropdowns, tooltips)
- Do not introduce Mantine

Do not mix the two systems. Pick one per application and be consistent.

## Visual standards

These apply regardless of styling system.

**Typography** — establish at least three distinct sizes (heading, body, label/caption); body text line-height 1.5; constrain readable text to 60–80 characters wide; heading hierarchy is sequential and meaningful.

**Spacing** — derive from a base-8 scale (4, 8, 16, 24, 32, 48, 64px); spacing between related elements is smaller than between unrelated ones; every section has clear breathing room.

**Colour** — one primary action colour used consistently; limit accent colours to two or three; background/surface/border form a clear hierarchy; never use colour alone to convey meaning; all text meets WCAG AA contrast (4.5:1 body, 3:1 large text).

**Interactive elements** — every button, link, and input has four explicit states: default, hover, focus, disabled; focus states are always visible, never suppressed without a replacement; primary buttons filled, secondary outlined/ghost, destructive actions distinct (typically red); minimum 44×44px touch targets.

**Forms** — every input has a visible label above it (placeholder is not a substitute); validation errors appear adjacent to the relevant field; required/optional marking is consistent; submission buttons show loading state while a request is in flight.

**Feedback** — every async operation shows a loading indicator scoped to that action; success and error messages are specific; destructive actions require confirmation that names the specific thing being destroyed.

## Component design principles

- One component, one responsibility
- Separate container components (data fetching, state, business logic) from presentational components (receive props, render UI)
- Design props like a function signature — intentional, with sensible defaults
- Prefer composition over configuration flags
- No logic in JSX — extract conditionals and transformations into variables before the return statement

## Mantine conventions (business apps)

- Use Mantine's built-in components before building custom ones
- Style in this order: `classNames` with CSS Modules → Mantine CSS variables/tokens → `styles` prop for one-offs; never use arbitrary hex values or hardcoded spacing
- Define the theme in one place; override centrally, not ad hoc in components
- Forms use `@mantine/form`; validate on submit by default, with field-level validation after the first submit attempt

## Tailwind conventions (consumer apps)

- Use Tailwind utility classes exclusively; write custom CSS only for complex animations or third-party overrides
- Use Radix UI for interactive accessible components; style with Tailwind
- Establish design tokens (brand colours, spacing, type scale) in `tailwind.config.ts`; use these throughout; avoid arbitrary values except for one-off pixel-perfect requirements
- Organise classes consistently: layout → sizing → spacing → typography → colour → border → effects; use `prettier-plugin-tailwindcss` to enforce order

## Accessibility

- All images have meaningful `alt` text; decorative images use `alt=""`
- Form inputs have associated labels via `htmlFor`/`id` or wrapping
- Interactive non-native elements have `role` and `aria-*` attributes
- Focus states are always visible
- Use semantic HTML: `<button>` for actions, `<a>` for navigation

## Responsiveness

Design mobile-first. Base styles target small screens; breakpoint overrides target larger screens. Do not hardcode widths for content containers.

## State management

- Local UI state: `useState` or `useReducer` in the owning component
- Shared UI state: React context (infrequently changing) or Zustand (frequently changing or accessed widely)
- Server state: React Query (`@tanstack/react-query`) — do not replicate server state into `useState`
- Do not reach for Redux for new projects

## Loading and error states

Every data-dependent component handles exactly three states: loading, error, and success. Use skeleton loaders for loading states. Error states must be actionable (include a retry button). Do not show empty and loading states simultaneously.

## In-app help

Help is a first-class design concern. If a reviewer would need to explain a UI element to someone new, that explanation should already be in the UI.

- **Tooltips** — for icon-only buttons (the tooltip is the accessible label) and non-obvious constraints; maximum one sentence; never put critical information only in a tooltip (invisible on touch); trigger on hover and keyboard focus
- **Help icon popovers** — for fields with business rules that need 2–4 sentences; place immediately after the field label
- **Always-visible help text** — for fields with format requirements or values that affect downstream behaviour; one sentence; visually subordinate to the label
- **Empty states** — every empty state has: an icon, a heading naming what is empty, 1–2 sentences explaining what it is and why the user would want one, and a primary action to create the first item; never use generic copy ("No items found")

## Screenshots (definition of done)

After completing any UI changes, take screenshots of the affected routes and attach them to the task log. Use the project's installed browser automation framework to script full interaction flows — not just the page-load state. Capture each meaningful interaction state: default, form open, validation error, success, etc. Save to `agent-logs/YYYY-MM-DD-{slug}/` named as `route_state-description_viewport.png`.
