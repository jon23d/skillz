---
name: tailwind
description: Tailwind CSS conventions for the Vite + React frontend in this harness. Load whenever styling components, configuring tailwind.config.ts, choosing utility classes, deciding when to extract a component, or working with the design-token system. Pairs with `shadcn-ui` (component library) and `vite-react` (frontend skeleton).
---

# Tailwind CSS

Tailwind is the only styling system for the frontend. There is no Mantine, no styled-components, no CSS Modules, no Emotion. Tailwind utilities + a small set of design tokens (CSS variables) + shadcn/ui components is the entire system.

## Install (for an existing Vite + React project)

```bash
pnpm add -D tailwindcss postcss autoprefixer
pnpm dlx tailwindcss init -p
```

This generates `tailwind.config.ts` and `postcss.config.js`.

## `tailwind.config.ts`

Use the TypeScript config — not the JavaScript one. shadcn/ui assumes the file shape below; do not deviate without a reason.

```ts
import type { Config } from "tailwindcss"
import animate from "tailwindcss-animate"

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [animate],
} satisfies Config
```

## `src/index.css`

The single global stylesheet. It defines the design tokens as CSS variables and pulls in Tailwind's layers.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    /* ... full dark palette ... */
  }

  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
```

These tokens are the same shape shadcn/ui ships. Override the values to match the brand; do not rename the tokens.

## Conventions

### Use semantic tokens, never raw colours

```tsx
// Good — semantic, theme-aware
<div className="bg-card text-card-foreground border border-border">

// Bad — raw, breaks dark mode and brand changes
<div className="bg-white text-slate-900 border border-slate-200">
```

If you find yourself reaching for `slate-500` or `gray-700`, the design system is missing a token. Add the token, do not hard-code the colour.

### Spacing scale only

Use Tailwind's spacing scale (`p-4`, `gap-6`, `mt-8`). Never `p-[13px]`. Arbitrary values are an escape hatch for one-offs from a design tool — they should be rare and reviewed.

### Utility ordering

When you have many utilities on one element, group them in this order. The Prettier `prettier-plugin-tailwindcss` plugin enforces this automatically — install it.

```bash
pnpm add -D prettier-plugin-tailwindcss
```

```js
// .prettierrc
{ "plugins": ["prettier-plugin-tailwindcss"] }
```

### When to extract a component

Three identical groupings of utilities is the threshold. Two is fine — DRY pressure that early just produces premature abstractions.

When you do extract, use the `cn()` helper from `@/lib/utils` (provided by shadcn) so consumers can override:

```tsx
import { cn } from "@/lib/utils"

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "muted"
}

export function Panel({ className, variant = "default", ...props }: PanelProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border p-6",
        variant === "muted" && "bg-muted",
        className,
      )}
      {...props}
    />
  )
}
```

### Responsive design

Mobile-first. Use Tailwind's breakpoint prefixes (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`). Never write a media query in CSS.

```tsx
<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
```

### Dark mode

`darkMode: ["class"]` means dark mode is opt-in by adding `dark` to a parent (usually `<html>`). Provide a `useTheme()` hook that toggles `document.documentElement.classList`.

Always test the dark palette when you add a new component — the easiest way to ship a regression is to ignore dark mode until later.

### Accessibility in utilities

- `focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none` on every interactive element. shadcn components have this baked in; preserve it when customising.
- `sr-only` for screen-reader-only labels.
- Touch targets: `h-10 min-w-10` (40px) at minimum, `h-11` (44px) for primary actions.

## Common mistakes

- **`@apply` everywhere in a global stylesheet** — defeats the point of utility-first. Use `@apply` sparingly inside `@layer base` for things like default button reset.
- **Importing component-specific CSS files** — there should be exactly one CSS file (`index.css`). If you have a `Button.css`, you are doing it wrong.
- **Overriding shadcn component styles via `!important`** — pass utility classes via `className` and let `cn()` merge them.
- **`bg-gray-50` instead of `bg-muted`** — semantic tokens, always.
- **Disabling `prettier-plugin-tailwindcss`** — class order matters for diff readability and review speed. Keep it on.
- **`lg:hidden md:block`** — wrong order. Mobile-first means smallest first: `md:block lg:hidden`.
- **Putting Tailwind config inside `vite.config.ts`** — separate files. Vite reads PostCSS, PostCSS reads Tailwind.
