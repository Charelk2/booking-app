# Mobile UX Audit Report

This document outlines key friction points in the current booking wizard and proposes adjustments to achieve a smoother mobile flow.

## Date & Time
* **Pain Points:** Calendar occupies the entire viewport on small screens and "Next" sits above the keyboard when picking time.
* **Improvements:**
  - Use collapsible sections so only calendar or time input is visible at once.
  - Add contextual hint under the calendar explaining unavailable dates.

## Location
* **Pain Points:** Map and autocomplete take up significant vertical space.
* **Improvements:**
  - Collapse map preview until a location is selected.
  - Provide tooltip explaining distance warnings.

## Attendees
* **Pain Points:** Number input is small and near the top.
* **Improvements:**
  - Enlarge touch target and keep action buttons in the bottom bar.

## Venue Type
* **Pain Points:** Drop‑down overlaps with keyboard.
* **Improvements:**
  - Convert to bottom sheet style selector on mobile.
  - Trap focus inside the sheet and close it with Escape or by tapping the
    overlay.

## Event Type & Sound
* **Improvements:** Both steps now use the same bottom sheet selector pattern on mobile for a consistent touch-friendly experience.

## Notes
* **Pain Points:** Large textarea forces users to scroll.
* **Improvements:**
  - Collapse optional notes section until users opt‑in.

## Review
* **Pain Points:** Totals and details push submit button below the fold.
* **Improvements:**
  - Sticky summary header with collapsible line items.
  - Confirm submission with toast and inline message.

## Global Recommendations
* Show a simple progress bar above the form steps. The bar scrolls naturally with the page instead of sticking under the header.
* Ensure all buttons have at least 44×44 px tappable area and sufficient contrast. ✅ Implemented across booking steps in June 2025.
* Defer maps and heavy images until after the initial step loads.
* Provide skeleton loaders for availability checks and quote calculations.
* Maintain the existing <code>MobileBottomNav</code> for consistent navigation.

## Collapsible Sections Component
The `CollapsibleSection` component replaces raw `<details>` elements in the booking wizard. Each step header is rendered as a button with proper `aria-expanded` state so screen readers and keyboard users can toggle sections just as easily as touch users.

```tsx
<CollapsibleSection title="Location" open={isOpen} onToggle={() => setOpen(!isOpen)}>
  <LocationStep />
</CollapsibleSection>
```
