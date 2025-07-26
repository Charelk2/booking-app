# Accessibility Guidelines

This project aims to meet WCAG 2.1 AA standards across the frontend.

## General Principles

- Provide descriptive `alt` text for all meaningful images.
- Ensure interactive elements have clear labels via `aria-label` or visible text.
- Use focus-visible styles on buttons, form fields and navigation links.
- Manage keyboard focus when dialogs or wizards open and close.
- Announce dynamic content with `aria-live` regions where appropriate.

## Testing

Accessibility checks run using [axe](https://github.com/dequelabs/axe-core) in Jest. Add
new tests under `frontend/src/__tests__` to verify pages render without violations.

Run all tests with:

```bash
./scripts/test-all.sh
```

## Components

- **PriceFilter** uses a keyboard focus trap and returns focus to the triggering element.
- **BookingWizard** moves focus to the step heading when advancing steps.
- **MobileMenuDrawer** relies on `@headlessui/dialog` for accessible focus handling.
- **AddServiceModal** opens with `@headlessui/dialog`, trapping focus and closing on Escape.

Contributions should follow these guidelines to maintain an inclusive experience.
