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

Use `<CollapsibleSection>` from `@/components/ui` for expandable groups. It renders a button with `aria-expanded` and toggles a region identified by `aria-controls`, providing accessible accordions for wizard steps and dashboards. The component also accepts an optional `description` prop to display short instructions directly beneath the title and above the divider.

### BottomSheet

`<BottomSheet>` displays a sliding panel anchored to the viewport bottom. It wraps Headless UI's `Dialog` to trap focus, animates with Tailwind transitions, and returns focus to the trigger on close. Apply it for mobile pickers, filter sheets, and modal forms.
Provide a `title` prop to render an accessible heading inside `Dialog.Title`. The component wires this title to `aria-labelledby` on the dialog so screen readers announce the sheet context.

### Mobile Navigation

Mobile navigation uses the `MobileBottomNav` component. It appears only below the `sm` breakpoint, hides on downward scroll, and supports unread message badges. Keep route names and icons consistent across the app.

### Safe-area Utilities

Use the `pt-safe` and `pb-safe` Tailwind classes to apply `env(safe-area-inset-*)` padding so content avoids notches and other device insets. When an element also needs space for the mobile navigation bar, combine these utilities with the `--mobile-bottom-nav-height` variable:

```jsx
<div
  className="pt-safe pb-safe"
  style={{
    paddingBottom:
      'calc(var(--mobile-bottom-nav-height, 0px) + env(safe-area-inset-bottom))',
  }}
>
  ...
</div>
```

### Navigation Guidelines

- All navigation links and buttons should use the shared `NavLink` component or the `navItemClasses` utility to ensure consistent typography and spacing.
- Interactive targets must be at least `44x44px` (`min-w-[44px] min-h-[44px]`).
- Provide either visible text or an `aria-label` for every interactive element.
- Active links are styled by passing `isActive` to `NavLink`.

## Maintenance

Review and update this file alongside major UI or design system changes.
