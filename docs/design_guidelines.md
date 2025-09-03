# Design Guidelines

This document summarizes the design system used across the Booking App. It covers layout spacing, typography, the color palette, and common UI components.

## Layout Spacing

All spacing is based on a **4&nbsp;px** scale so margins and padding remain consistent. Common increments include `4px`, `8px`, `12px`, `16px`, `24px` and `32px`. Components use Tailwind utility classes such as `p-4`, `py-8` or `gap-6` to keep layouts aligned.

## Typography Hierarchy

Headings follow a clear typographic hierarchy:

| Element | Size             | Weight |
| ------- | ---------------- | ------ |
| `h1`    | `2rem` (32px)    | `700`  |
| `h2`    | `1.5rem` (24px)  | `600`  |
| `h3`    | `1.25rem` (20px) | `600`  |
| Body    | `1rem` (16px)    | `400`  |

The base font family is Inter via the CSS variable `--font-sans` defined in `globals.css`.

## Color Palette

The application uses a small brand palette:

| Token                | Hex       |
| -------------------- | --------- |
| `--color-primary`    | `#FF5A5F` |
| `--color-secondary`  | `#E04852` |
| `--color-accent`     | `#FF7A85` |
| `--color-border`     | `#FFD0D3` |
| `--color-background` | `#ffffff` |
| `--color-foreground` | `#111827` |

These values power Tailwind classes such as `bg-brand`, `text-brand-dark` and `border-brand`. The light tint `--brand-color-light` (`#FFEAEA`) is used for subtle gradients.

### Neutral Grays

The design system includes a small set of gray tokens for backgrounds and text:

| Token              | Hex       |
| ------------------ | --------- |
| `--color-gray-100` | `#F3F4F6` |
| `--color-gray-400` | `#CBD5E1` |
| `--color-gray-500` | `#9CA3AF` |
| `--color-gray-700` | `#374151` |

Use these tokens in custom CSS rather than hard-coding gray values. They map to Tailwind's neutral palette and keep the UI consistent.

### Dashboard Palette

The analytics dashboard uses a complementary set of tokens for charts and status badges:

| Token                   | Hex       |
| ----------------------- | --------- |
| `--dashboard-primary`   | `#0047AB` |
| `--dashboard-secondary` | `#FFD700` |
| `--dashboard-accent`    | `#FF6347` |

Utility classes like `bg-brand-primary` and `text-brand-secondary` map to these variables so you can update the dashboard theme in one place.

## Component Styles

### Buttons

Use the `Button` component with variants defined in `src/styles/buttonVariants.ts`:

- **primary** – pink background, white text
- **secondary** – white background, pink border
- **outline** – transparent background, pink border
- **danger** – red background for destructive actions
- **link** – text-only button for inline actions

Buttons use a `rounded-lg` radius and display a subtle shadow on hover.

### Inputs

`TextInput` in `src/components/ui` provides consistent padding, focus rings and optional error messages. Always include a label for accessibility.

### Cards

Cards use `rounded-xl` corners with a `shadow-sm` and `border` in the brand border color. They respect the same spacing scale so content aligns with other components.

`SelectableCard` replaces plain radio buttons in the booking wizard. It hides the native input and styles the associated label as a clickable card using Tailwind `peer` classes. This provides large touch targets, hover states and a subtle brand-colored highlight when selected.

### Search Popups

Search popups use `rounded-xl` corners with a `shadow-xl` and omit ring borders, relying on the shadow for contrast against the background.

These guidelines ensure a cohesive look and feel as the app evolves.
For tips on organising Tailwind utility classes and performance
optimisations, see [css_best_practices.md](css_best_practices.md).
