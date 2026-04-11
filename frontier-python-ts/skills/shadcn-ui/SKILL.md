---
name: shadcn-ui
description: shadcn/ui component library guide for the Vite + React frontend in this harness. Load whenever building UI from primitive components, adding a new shadcn component, customising one, or composing forms, modals, tables, and dropdowns. Pairs with `tailwind` (the styling system shadcn is built on) and `vite-react` (the project skeleton).
---

# shadcn/ui

shadcn/ui is the only component library in this harness. There is no Mantine, no MUI, no Chakra, no Ant. Every reusable UI primitive (Button, Dialog, DropdownMenu, Form, Select, Toast, Table, Sheet, Tabs, Tooltip…) comes from shadcn/ui — which means it gets *copied into your repo*, not imported from a package.

## What "shadcn/ui" actually is

shadcn/ui is **not** an npm package you install once and import from. It is a CLI that copies fully-styled, accessible component source files (built on Radix UI primitives + Tailwind) into your project's `src/components/ui/` directory. You then own those files — edit them freely, version them with the rest of the codebase, no upgrade dance.

This is the single most important thing to internalise:

> Components are *yours*. There is no `import { Button } from "shadcn-ui"`. There is `import { Button } from "@/components/ui/button"`, where `button.tsx` lives in your repo.

## Initialising shadcn in a project

Run once per project, after Tailwind is set up:

```bash
pnpm dlx shadcn@latest init
```

The CLI asks several questions. Answer them like this:

| Question | Answer |
|---|---|
| Style | **default** |
| Base color | **slate** (or whatever the design system specifies) |
| CSS variables | **yes** — required for theming |
| `components.json` location | accept default |
| Components alias | `@/components` |
| Utils alias | `@/lib/utils` |
| RSC | **no** (Vite, not Next) |
| TypeScript | **yes** |

This creates `components.json`, `src/lib/utils.ts` (with the `cn()` helper), and updates `tailwind.config.ts` and `src/index.css`.

## Adding a component

```bash
pnpm dlx shadcn@latest add button
pnpm dlx shadcn@latest add dialog
pnpm dlx shadcn@latest add form
pnpm dlx shadcn@latest add input label select textarea
pnpm dlx shadcn@latest add table
pnpm dlx shadcn@latest add toast
```

Each `add` command writes one or more files to `src/components/ui/`. The CLI also installs the underlying Radix dependency.

After adding, **review the generated file**. You may want to:

- Trim variants you do not use
- Wire in your design tokens
- Add app-specific accessibility behaviour

You own these files. Treat them like any other code in the repo — review, refactor, test.

## Importing in components

```tsx
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

export function CreateProjectButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>New project</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
        </DialogHeader>
        {/* form goes here */}
      </DialogContent>
    </Dialog>
  )
}
```

Rules:

- **Always import from `@/components/ui/<name>`.** Never from a third-party package.
- **`asChild` slots a child as the trigger.** Use it instead of nesting buttons inside buttons.
- **Compose, do not subclass.** If you need a "primary destructive button", make a new component that wraps `Button` with the right `variant="destructive"`, do not modify `button.tsx` for the one-off.

## Forms — `react-hook-form` + `zod` + shadcn `Form`

shadcn's `Form` component wraps `react-hook-form`. This is the canonical pattern in this harness.

```bash
pnpm add react-hook-form @hookform/resolvers zod
pnpm dlx shadcn@latest add form input label
```

```tsx
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { useCreateProject } from "@/hooks/useCreateProject"

const schema = z.object({
  name: z.string().min(1, "Required").max(200),
  description: z.string().max(10_000).optional(),
})

type Values = z.infer<typeof schema>

export function CreateProjectForm({ onCreated }: { onCreated: () => void }) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "" },
  })
  const { mutateAsync, isPending } = useCreateProject()

  const onSubmit = async (values: Values) => {
    await mutateAsync(values)
    onCreated()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating…" : "Create"}
        </Button>
      </form>
    </Form>
  )
}
```

Rules:

- **`zod` is for form validation only.** It is not the runtime validation layer for the API — that is FastAPI/Pydantic. The frontend `zod` schema is local UI validation.
- **`FormMessage` shows the validation error** automatically — never write `{errors.name && <span>...</span>}` inline.
- **`FormLabel`** is wired to the `Input` automatically via `htmlFor` — never write your own `<label>`.
- **Mutations come from a TanStack Query hook**, not directly from a service.

## Tables — `@tanstack/react-table` + shadcn `Table`

shadcn provides the visual `Table` primitives; combine them with `@tanstack/react-table` for sorting, filtering, and pagination.

```bash
pnpm add @tanstack/react-table
pnpm dlx shadcn@latest add table
```

The shadcn docs ship a `<DataTable>` example you can copy into `src/components/ui/data-table.tsx` and own.

## Notifications — `sonner` (shadcn's recommended toast)

```bash
pnpm dlx shadcn@latest add sonner
```

Mount `<Toaster />` once in `RootLayout`, then call `toast.success("...")`, `toast.error("...")` from anywhere.

```tsx
import { toast } from "sonner"

await mutation.mutateAsync(values)
toast.success("Project created")
```

## Theming

Theme via the CSS variables in `src/index.css` (set up by `shadcn init`). Do not edit individual component files to change colours — change the token, the component picks it up.

Dark mode is `darkMode: ["class"]` (see the `tailwind` skill). A theme provider that toggles `document.documentElement.classList.add("dark")` lives in `src/components/theme-provider.tsx` (a shadcn pattern).

## What lives where

```
src/
  components/
    ui/                        # shadcn-generated primitives — own them
      button.tsx
      dialog.tsx
      form.tsx
      input.tsx
      table.tsx
      ...
    layout/                    # app-specific layout (RootLayout, Sidebar)
    <feature>/                 # feature-specific composed components
      CreateProjectForm.tsx
      ProjectList.tsx
  lib/
    utils.ts                   # cn() helper (created by shadcn init)
```

## Testing shadcn components

Use React Testing Library queries by accessible role / label / text — exactly the way shadcn's components are built to be queried. See the `tdd` skill.

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CreateProjectForm } from "./CreateProjectForm"

it("submits the form", async () => {
  const user = userEvent.setup()
  render(<CreateProjectForm onCreated={vi.fn()} />)

  await user.type(screen.getByLabelText(/name/i), "My project")
  await user.click(screen.getByRole("button", { name: /create/i }))

  expect(await screen.findByText(/created/i)).toBeInTheDocument()
})
```

`getByLabelText` and `getByRole` work because shadcn wires `FormLabel` to its input correctly.

## Common mistakes

- **Trying to `import { Button } from "shadcn-ui"`** — that package does not exist. Always `@/components/ui/button`.
- **Editing a shadcn component to fix a bug for one screen** — make a wrapper component instead.
- **Re-running `shadcn add button` on a customised component** — the CLI overwrites. Customisations are yours; do not regenerate them.
- **Inlining a `<button>` instead of using `<Button asChild>`** — you lose focus styles, accessibility, and visual consistency.
- **Writing your own modal** — use `Dialog`. Always.
- **Querying tests with `getByTestId`** — never. shadcn components are built for `getByRole` / `getByLabelText`.
- **Using `zod` to validate API responses on the frontend** — types come from `openapi-typescript`. Use `zod` for forms only.
