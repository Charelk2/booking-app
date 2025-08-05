# Frontend Style Guide

This guide documents layout breakpoints, design tokens, and reusable UI patterns. For project setup and testing instructions, see [README.md](README.md). Update this file whenever the interface changes significantly.

## Tailwind Breakpoints

| Name | Width | Design usage |
| ---- | ----- | ------------ |
| `sm` | `BREAKPOINT_SM` (640px) | base mobile layout, `MobileBottomNav` and `BottomSheet` triggers |
| `md` | `BREAKPOINT_MD` (768px) | tablet layouts and two-column grids |
| `lg` | `BREAKPOINT_LG` (1024px) | desktop layouts with sidebars |
| `xl` | 1280px | wide desktop, max content width |
| `2xl` | 1536px | very wide screens and large monitors |

The `sm`, `md`, and `lg` values come from [`breakpoints.config.js`](breakpoints.config.js) and are re-exported via `@/lib/breakpoints` for hooks like `useIsMobile` so JavaScript and CSS stay in sync.

## CSS Variables

All colors and custom spacing values must be expressed as CSS variables and declared in [`src/app/globals.css`](src/app/globals.css). Reference them with `var(--token-name)` instead of hard-coded hex or pixel values:

```css
:root {
  --color-primary: #ff5a5f;
  --space-lg: 1.5rem;
}
```

```jsx
<div className="text-[var(--color-primary)] p-[var(--space-lg)]" />
```

### Tokens

| Token | Value | Description |
| ----- | ----- | ----------- |
| `--space-px` | `1px` | Hairline spacing for subtle offsets |
| `--space-1` | `0.25rem` | Base unit for small translations |
| `--color-foreground-rgb` | `17 24 39` | RGB components of `--color-foreground` |
| `--shadow-sm` | `0 6px 20px rgb(var(--color-foreground-rgb) / 8%)` | Subtle card shadow |
| `--shadow-md` | `0 8px 24px rgb(var(--color-foreground-rgb) / 15%)` | Hover card shadow |

## Component Patterns

### CollapsibleSection

Use `<CollapsibleSection>` from `@/components/ui` for expandable groups. It renders a button with `aria-expanded` and toggles a region identified by `aria-controls`, providing accessible accordions for wizard steps and dashboards.

### BottomSheet

`<BottomSheet>` displays a sliding panel anchored to the viewport bottom. It wraps Headless UI's `Dialog` to trap focus, animates with Tailwind transitions, and returns focus to the trigger on close. Apply it for mobile pickers, filter sheets, and modal forms.

### Mobile Navigation

Mobile navigation uses the `MobileBottomNav` component. It appears only below the `sm` breakpoint, hides on downward scroll, and supports unread message badges. Keep route names and icons consistent across the app.

## Maintenance

Review and update this file alongside major UI or design system changes.
