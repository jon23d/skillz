---
name: ui-design
description: React UI design principles and conventions. Load this skill when building or modifying any user interface. Covers component design, application type detection, Mantine (business apps) and Tailwind (consumer apps), accessibility, responsiveness, and state management patterns.
license: MIT
compatibility: opencode
---

## Determine application type first

Before writing any UI code, determine whether this is a **business-facing** or **consumer-facing** application. This determines the entire styling and component approach.

**Business-facing** (internal tools, dashboards, admin panels, B2B SaaS, data-heavy interfaces):
- Use **Mantine** as the component library
- Style using Mantine's styling system (`styles`, `classNames`, `sx`, CSS Modules with Mantine tokens)
- Do not introduce Tailwind

**Consumer-facing** (marketing sites, consumer products, public-facing apps, brand-driven experiences):
- Use **Tailwind CSS** for all styling
- Use **Radix UI** for unstyled accessible primitives (dialogs, dropdowns, tooltips, etc.)
- Do not introduce Mantine

Do not mix the two systems. Pick one per application and be consistent.

---

## Visual standards

These rules apply regardless of whether you are using Mantine or Tailwind. They express the difference between an interface that looks considered and one that looks generated. Follow them without exception.

### Typography

- Establish a scale of at least three distinct sizes: heading, body, and label/caption. Never use a single font size throughout a UI.
- Body text uses a line height of 1.5. Headings use 1.2–1.3.
- Constrain line length for readable text to 60–80 characters (`max-w-prose` in Tailwind, `maw` in Mantine). Never let paragraphs stretch full width.
- Heading hierarchy is meaningful and sequential — do not skip levels (h1 → h3) or use heading tags for visual size alone.
- Use font weight to establish hierarchy: one heavy weight for primary headings, one medium weight for subheadings, regular for body. Do not use more than three weights on a single screen.

### Spacing

- Derive all spacing from a base-8 scale: 4, 8, 16, 24, 32, 48, 64px. No arbitrary values.
- Spacing between related elements is smaller than spacing between unrelated elements. A label and its input are closer together than two separate form fields.
- Every section of a page has clear breathing room. Content that is cramped to the edges reads as unfinished.
- Padding inside a container is consistent on all sides unless there is a deliberate reason to differ.

### Colour

- Every UI has one primary action colour used consistently for all primary buttons and key interactive elements. It does not appear decoratively.
- Limit accent colours to two or three across the entire interface. More than three competing colours creates visual noise.
- Background, surface, and border colours form a clear hierarchy: page background is the darkest (or lightest), cards/panels sit one step above, inputs and interactive surfaces one step above that.
- Never use colour alone to convey meaning — pair it with an icon, label, or pattern. This applies to status indicators, validation states, and charts.
- All text meets WCAG AA contrast minimums: 4.5:1 for body text, 3:1 for large text and UI components.

### Visual hierarchy

- Every screen has one primary action. It is visually dominant. Secondary actions are visually subordinate.
- The most important content on a page has the most visual weight — through size, contrast, or position, not decoration.
- Decorative elements (dividers, background patterns, icons used ornamentally) are subtle. They must never compete with content.
- Empty space is intentional. Do not fill it. Whitespace is structure.

### Interactive elements

- Every button, link, input, and interactive element has four explicit states: default, hover, focus, and disabled. None of these are left to browser defaults alone.
- Focus states are always visible and never suppressed with `outline: none` without a replacement style.
- Primary buttons are filled. Secondary buttons are outlined or ghost. Destructive actions use a distinct colour (typically red). These conventions are consistent throughout the application.
- Click targets for interactive elements are at minimum 44×44px on touch surfaces.

### Iconography

- Icons are used to reinforce meaning, not replace text in ambiguous contexts. If an icon's meaning is not immediately obvious, it has a visible label or tooltip.
- Icon sizes are consistent within a context — navigation icons are all the same size, inline icons are all the same size.
- Icons are sourced from a single library throughout the application. Do not mix icon sets.

### Forms

- Every input has a visible label above it. Placeholder text is not a substitute for a label.
- Validation errors appear adjacent to the field they relate to, not only at the top of the form.
- Required fields are marked consistently — either all required fields are marked, or all optional fields are marked. Never both.
- Submission buttons are disabled or show a loading state while a request is in flight.
- Multi-field forms group related fields visually (billing address fields together, personal info together).

### Feedback and communication

- Every user action that triggers an async operation shows a loading indicator scoped to that action, not a full-page spinner.
- Success and error feedback is specific. "Profile updated" beats "Success". "Email already in use" beats "Error".
- Destructive actions (delete, archive, revoke) require confirmation. The confirmation UI names the specific thing being destroyed.
- Toasts and notifications are used for transient feedback. Persistent errors live inline near the relevant content.

---

## Component design principles

**One component, one responsibility.** A component should do one thing at one level of abstraction. If a component manages data fetching, layout, and user interaction simultaneously, break it apart. This is the single most important rule in this section.

**A component file should not exceed 150 lines.** This is a hard signal, not a style preference. A file longer than 150 lines is almost always doing too much. When you approach this limit, decompose — do not keep adding to the file.

### Decomposition rules

**Separate data from presentation.** A component that calls `useQuery` or `useMutation` should not also contain complex JSX. Extract the data-fetching logic into a custom hook, then render child components that receive the data as props.

```tsx
// Bad — data fetching and complex rendering in one component
function UserDashboard() {
  const { data: user } = useQuery({ queryKey: ['user'], queryFn: fetchUser })
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects })
  const { data: activity } = useQuery({ queryKey: ['activity'], queryFn: fetchActivity })

  return (
    <div>
      {/* 200 lines of JSX using user, projects, and activity */}
    </div>
  )
}

// Good — hook owns data, page composes focused children
function useUserDashboard() {
  const user = useQuery({ queryKey: ['user'], queryFn: fetchUser })
  const projects = useQuery({ queryKey: ['projects'], queryFn: fetchProjects })
  const activity = useQuery({ queryKey: ['activity'], queryFn: fetchActivity })
  return { user, projects, activity }
}

function UserDashboard() {
  const { user, projects, activity } = useUserDashboard()
  return (
    <Stack>
      <UserHeader user={user.data} isLoading={user.isLoading} />
      <ProjectList projects={projects.data} isLoading={projects.isLoading} />
      <ActivityFeed items={activity.data} isLoading={activity.isLoading} />
    </Stack>
  )
}
```

**Extract every visually distinct section as its own component.** If a section of JSX has its own heading, its own data, or its own interaction pattern, it is a separate component. Do not nest it inline.

**More than three `useState` calls is a smell.** If a component manages more than three pieces of local state, either group related state with `useReducer`, extract a custom hook, or split the component.

**JSX nesting deeper than three levels means you missed an extraction.** If your JSX is indented more than three levels deep inside a return statement (not counting fragments or simple wrappers), extract the inner section into a named component.

### Props are the interface

Design component props the way you design a function signature — with intention. Required props should be necessary. Optional props should have sensible defaults. Avoid prop bags (`options: {}`) that obscure what a component actually needs.

### Prefer composition over configuration

Rather than a single component with many boolean flags (`showHeader`, `compact`, `withBorder`), prefer composing smaller components together. Flags are a sign a component is doing too much.

```tsx
// Avoid
<DataTable showFooter compact withBorder headerAction={<Button />} />

// Prefer
<DataTable>
  <DataTable.Header action={<Button />} />
  <DataTable.Body compact />
  <DataTable.Footer />
</DataTable>
```

### Never put logic in JSX

Extract conditionals and transformations into variables or functions before the return statement. JSX should read like a description of the UI, not a program.

### Red flags — stop and decompose

- The component file is approaching or exceeding 150 lines
- The component has more than three `useState` calls
- The component calls `useQuery` or `useMutation` and also contains significant JSX
- The JSX return has more than three levels of nesting
- The component handles multiple unrelated user interactions (e.g. form submission and table sorting and modal management)
- You are adding a new feature to an existing component by inserting another block of JSX rather than composing a new child component

---

## Business apps: Mantine conventions

Use Mantine's component library as-is before building custom components. Reach for `Table`, `DataTable` (mantine-datatable), `Modal`, `Drawer`, `Select`, `MultiSelect`, `DatePicker`, `Notifications`, `Menu`, `Tabs` before writing your own.

Style with Mantine's system in this order of preference:
1. `classNames` prop with CSS Modules for component-level overrides
2. Mantine CSS variables and tokens for consistency with the theme
3. `styles` prop for one-off inline style needs
4. Never use arbitrary hex values or hardcoded spacing — use theme tokens

```tsx
// Good — uses theme tokens
<Box p="md" bg="gray.0" style={{ borderRadius: 'var(--mantine-radius-sm)' }}>

// Bad — hardcoded values
<Box style={{ padding: '16px', background: '#f8f9fa', borderRadius: '4px' }}>
```

Define the theme in one place. Never override Mantine defaults ad hoc in individual components — extend the theme centrally.

Forms use `@mantine/form`. Validate on submit by default, with field-level validation on change after the first submit attempt.

---

## Consumer apps: Tailwind conventions

Use Tailwind utility classes exclusively. Do not write custom CSS unless absolutely necessary (complex animations, third-party overrides).

Use Radix UI primitives for interactive components that require accessibility: `Dialog`, `DropdownMenu`, `Select`, `Tooltip`, `Popover`, `Tabs`, `Accordion`. Style them with Tailwind `className` props.

Establish a design token vocabulary in `tailwind.config.ts` upfront — brand colours, spacing scale, typography scale. Use these tokens throughout. Do not use arbitrary values (`w-[347px]`) except for one-off pixel-perfect requirements.

```tsx
// Good — uses design tokens
<button className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-md text-sm font-medium">

// Avoid — arbitrary values
<button className="bg-[#4F46E5] w-[120px]">
```

Organise Tailwind classes in a consistent order: layout → sizing → spacing → typography → colour → border → effects. Use a Prettier plugin (`prettier-plugin-tailwindcss`) to enforce this automatically.

---

## Accessibility

Accessibility is not optional. Every interactive element must be keyboard navigable and screen reader compatible.

- All images have meaningful `alt` text. Decorative images use `alt=""`.
- Form inputs have associated labels — use `htmlFor` / `id` pairing or wrap the input in the label.
- Interactive elements that are not native `<button>` or `<a>` must have `role` and `aria-*` attributes.
- Colour is never the sole means of conveying information.
- Focus states are always visible — never `outline: none` without a custom focus style.
- Use semantic HTML. `<button>` for actions, `<a>` for navigation, `<nav>`, `<main>`, `<section>`, `<header>`, `<footer>` for structure.

When using Mantine, accessibility is largely handled by the library. When using Radix, the primitives are accessible by default — do not override their ARIA attributes without understanding the implications.

---

## Responsiveness

Design for mobile first. Write base styles for small screens and add breakpoint overrides for larger screens.

In Mantine: use responsive props (`p={{ base: 'sm', md: 'lg' }}`) and `useMediaQuery` hook.

In Tailwind: use mobile-first breakpoint prefixes (`sm:`, `md:`, `lg:`).

Do not hardcode widths for content containers. Use `max-w-*` with `mx-auto` in Tailwind or Mantine's `Container` component.

---

## State management

Local UI state (open/closed, form values, selected tab) lives in `useState` or `useReducer` in the component that owns it.

Shared UI state (current user, theme, notifications, permissions) lives in React context or a lightweight global store (Zustand). Use context for state that changes infrequently. Use Zustand for state that changes often or is accessed by many components.

Server state lives in `@tanstack/react-query`. Do not replicate server state into `useState`. The query cache is the source of truth for server data.

Do not reach for Redux. It is not justified for new projects.

---

## Loading and error states

Every data-dependent component must handle three states: loading, error, and success. There is no fourth option.

Use skeleton loaders (Mantine's `Skeleton`, or a Tailwind pulse animation) for loading states — not spinners in the middle of content that already has a known shape.

Error states must be actionable. "Something went wrong" with a retry button beats a raw error message.

Do not show empty states and loading states at the same time.

---

## Performance

Lazy load routes using `React.lazy` and `Suspense`. Do not bundle the entire application into one chunk.

Memoize with `useMemo` and `useCallback` only when there is a measured performance problem. Premature memoization adds noise and obscures intent.

Virtualise long lists (100+ rows) using `@tanstack/react-virtual` or `mantine-datatable`'s built-in virtualisation.

Images use correct dimensions, modern formats (WebP, AVIF), and lazy loading (`loading="lazy"`) unless above the fold.

---

## In-app help and embedded documentation

Every user-facing application must include help as a first-class design concern, not an afterthought. Users should be able to understand how to use any feature without leaving the application. Help is always contextual — it appears at the point of need, not behind a separate "Help" page.

The guiding principle: **if a reviewer needs to explain a UI element to someone new, that explanation should already be in the UI.**

---

### Tooltips

Use tooltips for brief, single-sentence explanations of controls, icons, or abbreviated labels. Tooltips are the lowest-friction help mechanism and should be applied liberally.

**When to use:**
- Icon-only buttons — the tooltip is the label
- Truncated text that needs its full value visible
- Form field labels where the purpose is obvious but the constraint is not (e.g., "Must match your registered email")
- Any interactive element that would require a second glance to understand

**Rules:**
- Tooltip content is one sentence maximum. If you need more, use a popover.
- Never put critical information only in a tooltip — tooltips are invisible on touch devices. Pair with visible help text for required knowledge.
- Tooltips trigger on hover and on keyboard focus. Never suppress the focus trigger.
- Delay tooltip appearance by 300–500ms to avoid flicker during cursor movement.

**Mantine implementation:**
```tsx
import { Tooltip, ActionIcon } from '@mantine/core'
import { IconTrash } from '@tabler/icons-react'

// Icon button — tooltip is the accessible label
<Tooltip label="Delete record" withArrow position="top">
  <ActionIcon variant="subtle" color="red" aria-label="Delete record">
    <IconTrash size={16} />
  </ActionIcon>
</Tooltip>

// Field label with constraint hint
<Tooltip label="Must be unique across all projects" withArrow>
  <TextInput label="Project slug" {...form.getInputProps('slug')} />
</Tooltip>
```

**Tailwind + Radix implementation:**
```tsx
import * as Tooltip from '@radix-ui/react-tooltip'

<Tooltip.Provider delayDuration={400}>
  <Tooltip.Root>
    <Tooltip.Trigger asChild>
      <button aria-label="Delete record" className="...">
        <TrashIcon className="w-4 h-4" />
      </button>
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content className="bg-gray-900 text-white text-sm px-2 py-1 rounded shadow-md">
        Delete record
        <Tooltip.Arrow className="fill-gray-900" />
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>
```

---

### Help icons and popovers

Use a help icon (`?` in a circle) followed by a popover for inline contextual explanations that require more than one sentence. The popover stays open until dismissed, giving the user time to read.

**When to use:**
- Form fields with non-obvious requirements or business rules
- Settings whose effects are not self-evident
- Any feature that previously generated support questions
- Fields that interact with each other in non-obvious ways

**Rules:**
- Place the help icon immediately after the field label, not at the end of the row.
- Popover content should be 2–4 sentences. If it needs more, link to an embedded help section.
- Include a concrete example where it helps: "e.g. `billing-2024-q1`".
- Popovers must be keyboard-accessible: trigger opens on Enter/Space, closes on Escape.

**Mantine implementation:**
```tsx
import { Popover, Text, ActionIcon, Group } from '@mantine/core'
import { IconHelpCircle } from '@tabler/icons-react'

function FieldWithHelp({ label, helpText, children }) {
  return (
    <Stack gap={4}>
      <Group gap={4} align="center">
        <Text component="label" size="sm" fw={500}>{label}</Text>
        <Popover width={260} position="top-start" withArrow shadow="md">
          <Popover.Target>
            <ActionIcon
              variant="transparent"
              size="xs"
              aria-label={`Help for ${label}`}
              color="gray"
            >
              <IconHelpCircle size={14} />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown>
            <Text size="sm">{helpText}</Text>
          </Popover.Dropdown>
        </Popover>
      </Group>
      {children}
    </Stack>
  )
}
```

---

### Field-level help text

Every form field that has a non-obvious purpose or constraint should have always-visible help text rendered beneath it. Unlike tooltips, this text is visible without interaction and accessible on touch devices.

**When to use:**
- Fields with format requirements (dates, phone numbers, slugs)
- Fields whose value affects downstream behaviour
- Any field that has caused user errors in the past

**Rules:**
- Help text is distinct from validation error text — it is always present; error text appears only on validation failure.
- Help text is concise: one sentence or a short phrase.
- Use a softer colour than the label to establish hierarchy. In Mantine: `c="dimmed"`. In Tailwind: `text-gray-500`.

**Mantine implementation:**
```tsx
<TextInput
  label="Billing email"
  description="Invoices will be sent here. Can differ from your login email."
  placeholder="billing@company.com"
  {...form.getInputProps('billingEmail')}
/>
```

**Tailwind implementation:**
```tsx
<div className="flex flex-col gap-1">
  <label htmlFor="billing-email" className="text-sm font-medium text-gray-700">
    Billing email
  </label>
  <input id="billing-email" type="email" className="..." />
  <p className="text-sm text-gray-500">
    Invoices will be sent here. Can differ from your login email.
  </p>
</div>
```

---

### Asides and contextual help panels

For complex features — multi-step workflows, configuration screens, dashboards with multiple interacting controls — provide a persistent aside (sidebar panel) that gives contextual documentation for the current section.

**When to use:**
- Settings pages with significant business impact
- Any screen where a user must understand context before acting
- Features that have a learning curve or where mistakes are costly

**Rules:**
- The aside is collapsible. Default it open on first visit (tracked in local storage); respect the user's collapsed preference on return.
- Aside content maps to the current section: if the user is on the "Billing" tab, the aside shows billing help. Update aside content when the active section changes.
- Include: a plain-English description of what the section does, a list of key concepts (in prose or a short definition list), and links to any relevant external documentation.
- Keep aside width to 260–300px. It must not compete with the main content area.

**Mantine AppShell aside:**
```tsx
import { AppShell, ScrollArea, Text, Title, Anchor } from '@mantine/core'

// In AppShell
<AppShell.Aside p="md" withBorder>
  <ScrollArea h="100%">
    <Stack gap="md">
      <Title order={5}>About this page</Title>
      <Text size="sm" c="dimmed">
        Webhook endpoints receive real-time event notifications from your account.
        Each event is delivered at least once; your endpoint must respond with HTTP
        200 within 10 seconds or the delivery will be retried.
      </Text>
      <Title order={6} mt="xs">Key concepts</Title>
      <Text size="sm"><strong>Signing secret</strong> — used to verify that events
        came from us. Validate the <code>X-Webhook-Signature</code> header on every
        request.
      </Text>
      <Anchor size="sm" href="/docs/webhooks" target="_blank">
        Full webhook documentation →
      </Anchor>
    </Stack>
  </ScrollArea>
</AppShell.Aside>
```

---

### Empty states as onboarding

Empty states are the most-missed opportunity for embedded documentation. When a list, table, or dashboard is empty, that is the highest-leverage moment to explain what belongs there and how to create it.

**Rules:**
- Every empty state has: an icon or illustration, a heading naming what is empty, 1–2 sentences explaining what this thing is and why the user would want one, and a primary action button to create the first item.
- Do not use generic empty state copy ("No items found", "Nothing here yet"). Be specific to the entity.
- If the empty state is the result of a search or filter returning nothing, explain that specifically and offer to clear the filter — do not reuse the zero-data empty state.

```tsx
// Good — specific and actionable
<EmptyState
  icon={<IconWebhook size={48} stroke={1} />}
  title="No webhook endpoints"
  description="Webhook endpoints let you receive real-time event notifications in your own systems. Add one to start receiving events."
  action={<Button leftSection={<IconPlus size={16} />}>Add endpoint</Button>}
/>

// Bad — generic and unhelpful
<EmptyState title="No items" description="Nothing here yet." />
```

---

### Embedded help sections

For complex features, embed a collapsible "How this works" section directly on the page — above the content for first-time users, or below the content for reference. This replaces the need to read external documentation for the common case.

**Rules:**
- Use an `Accordion` or `Disclosure` pattern. Default it collapsed after first open (persist state in local storage).
- Section title: "How this works" or "About [feature name]" — not "Help" (too generic).
- Content: step-by-step overview of the workflow, definitions of key terms, and at least one concrete example.
- Embedded help sections are most valuable on: settings pages, billing pages, developer/integration pages, and any multi-step flow.

**Mantine implementation:**
```tsx
import { Accordion, Text, Code, List } from '@mantine/core'

<Accordion variant="contained" mb="lg">
  <Accordion.Item value="how-it-works">
    <Accordion.Control>How webhooks work</Accordion.Control>
    <Accordion.Panel>
      <Stack gap="xs">
        <Text size="sm">
          When an event occurs in your account (e.g. a payment succeeds), we send
          an HTTP POST request to your endpoint URL with a JSON payload describing
          the event.
        </Text>
        <List size="sm" spacing={4}>
          <List.Item>Your endpoint must respond with HTTP 200 within 10 seconds</List.Item>
          <List.Item>Failed deliveries are retried up to 3 times with exponential backoff</List.Item>
          <List.Item>Validate the <Code>X-Webhook-Signature</Code> header on every request</List.Item>
        </List>
      </Stack>
    </Accordion.Panel>
  </Accordion.Item>
</Accordion>
```

---

### Help UX checklist

Before marking any frontend task as done, verify:

- [ ] Every icon-only button has a tooltip that is also its `aria-label`
- [ ] Every non-obvious form field has either help text (always visible) or a help icon popover
- [ ] Every settings or configuration page has an aside or embedded help section explaining what the settings do
- [ ] Every empty state is specific, explains what the thing is, and offers a primary action
- [ ] No help content is buried behind a separate "Help" page when it could live inline
- [ ] All help elements are keyboard-accessible and do not rely solely on hover

---

## Screenshots

After completing any UI changes, take screenshots of the affected routes and attach them to the task log. This is a required part of the definition of done for all frontend tasks.

### Screenshots come from e2e tests, not separate scripts

Do not write a standalone Playwright script for screenshots. Instead, add `page.screenshot()` calls directly into the e2e tests that exercise the changed UI. The tests already handle auth, navigation, data setup, and interaction — use that work. This avoids duplicating setup and keeps screenshots in sync with what the tests actually exercise.

**Before committing, remove every `page.screenshot()` call you added.** They must not appear in the committed test files. The screenshots themselves are committed to `agent-logs/`; the calls that produced them are not.

### What to capture

Ask yourself: **what would a reviewer need to see to confirm this feature works?** Take screenshots of those states. There will often be several.

- The default page state on arrival
- A revealed input, panel, or section after a button click
- An open modal, drawer, or dropdown
- A validation error state after a failed submission
- A success confirmation after a completed action
- Intermediate steps in a multi-step flow
- Mobile viewport (390×844) for states where responsive behaviour is relevant

Do not screenshot routes you did not touch. Do not take a single page-load screenshot and call it done if the feature only appears after interaction.

### Example — adding screenshot calls to an e2e test

```ts
// Inside an existing e2e test that exercises the "Add Item" flow:
test('user can add an item', async ({ page }) => {
  await page.goto('/items')

  // Screenshot: default state before interaction
  await page.screenshot({ path: `${AGENT_LOGS_PATH}/items_default_desktop.png`, fullPage: true })

  await page.click('button:has-text("Add Item")')
  await page.waitForSelector('label:has-text("Item name")')

  // Screenshot: form revealed after click
  await page.screenshot({ path: `${AGENT_LOGS_PATH}/items_form-open_desktop.png`, fullPage: true })

  await page.click('button:has-text("Save")')
  await page.waitForSelector('text=Item name is required')

  // Screenshot: validation error state
  await page.screenshot({ path: `${AGENT_LOGS_PATH}/items_validation-error_desktop.png`, fullPage: true })

  // ... rest of test assertions
})
// REMEMBER: remove all page.screenshot() calls before committing this file
```

### File naming

Name screenshots as `route_state-description_viewport.png`. The state description should be specific enough that someone reading the task log knows what they're about to see before opening the image.

```
agent-logs/
  2026-03-10-42-add-auth/
    log.md
    items_default_desktop.png
    items_form-open_desktop.png
    items_form-open_mobile.png
    items_validation-error_desktop.png
    items_saved_desktop.png
```

The path uses `agent-logs/` with no leading dot — it is not a hidden directory.
