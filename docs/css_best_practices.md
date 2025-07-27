# Tailwind CSS Strategy

This document outlines how we keep styles maintainable and performant.
It complements `docs/design_guidelines.md` which covers spacing,
typography and component patterns.

## Design Tokens

- Theme values such as colors and spacing are defined in
  `frontend/tailwind.config.js` using semantic names
  (`primary`, `secondary`, `accent`). Utility classes refer to these tokens
  so colors and sizes stay consistent across the app. Neutral grays like
  `--color-gray-100` and `--color-gray-700` are also defined to avoid
  scattering hard-coded gray values throughout stylesheets.
- Update a token in the config to change its value everywhere.
  Avoid hard–coding hex values or pixel numbers in JSX.

## Reusable Components

- Common UI elements live in `frontend/src/components/ui`.
  Components like `Button`, `Card` and `TextInput` map variant props
  to Tailwind class strings using `clsx`.
- Variant props ensure only approved color and size combinations are used.
  Prefer `<Button variant="primary">` over manually composing class names.

## Organising Utility Classes

- Tailwind classes are sorted automatically by Prettier using the
  `prettier-plugin-tailwindcss` plugin. Run `npx prettier --write` before
  committing to keep ordering consistent.
- Use shorthand utilities such as `py-4` or `mx-8` and break long class
  lists across lines when necessary for readability.

### Linting

All CSS files are linted with [Stylelint](https://stylelint.io/).
Run `npm run lint:css` from the `frontend` directory to check styles
for common issues like invalid selectors or unknown properties.
The configuration lives in `.stylelintrc.json` at the repository root
and extends the `stylelint-config-standard` rules.

## Headless UI and Heroicons

- Modal dialogs, menus and transitions use Headless UI components with
  Tailwind classes applied for styling.
- Icons come from `@heroicons/react` so sizes and colors align with the
  design tokens (e.g. `className="h-5 w-5 text-primary"`).

## Performance

- Tailwind JIT mode generates only the classes used in the project.
  Ensure the `content` array in `tailwind.config.js` covers all source
  files so unused CSS is purged.
- Production builds are minified automatically by Next.js. Keep animations
  lightweight by relying on transforms or opacity when using Framer Motion.

## Accessibility and Semantics

- Use semantic HTML elements (`<button>`, `<header>`, `<main>` etc.) and
  ensure interactive controls retain focus styles.
- Components accept `aria-label` and `data-testid` props so tests and
  assistive technologies have meaningful hooks.

## Code Review Checklist

- Do new styles rely on design tokens rather than hard–coded values?
- Are utility classes sorted and grouped logically?
- Could repeated class strings be moved into a shared component?
- Are you reusing existing UI components (like `Button`) instead of repeating
  long utility class lists?

Following these practices helps the codebase scale as features grow.
