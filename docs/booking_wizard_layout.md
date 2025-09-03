# Booking Wizard Layout

This snippet demonstrates the HTML structure and Tailwind CSS classes for the booking wizard content area. It implements a vertical text-only stepper on the left for large screens and stacks the elements on mobile.

```html
<main class="mx-auto max-w-7xl px-4 lg:px-8">
  <div class="lg:grid lg:grid-cols-[200px_1fr] lg:gap-8">
    <!-- Progress Stepper -->
    <aside class="flex justify-center lg:block">
      <nav
        class="sticky top-16 flex flex-col items-start space-y-6"
        aria-label="Progress"
      >
        <button type="button" class="text-gray-500">Event Details</button>
        <button type="button" class="font-semibold text-red-600" aria-current="step">Location</button>
        <button type="button" class="text-gray-500">Date &amp; Time</button>
        <button type="button" class="text-gray-500">Event Type</button>
        <button type="button" class="text-gray-500">Guests</button>
        <button type="button" class="text-gray-500">Venue Type</button>
        <button type="button" class="text-gray-500">Sound</button>
        <button type="button" class="text-gray-500">Notes</button>
        <button type="button" class="text-gray-500">Review</button>
      </nav>
    </aside>
    <!-- Main Content Card -->
    <section class="bg-white rounded-2xl shadow-xl p-8 space-y-6 max-w-md mx-auto lg:max-w-none lg:mx-0">
      <h2 class="text-2xl font-bold">Location</h2>
      <p>Where is the show?</p>
      <input type="search" class="w-full rounded-md border border-gray-300 p-2" placeholder="Search address" />
      <button class="text-sm text-[var(--brand-color)]">Use my location</button>
      <div class="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
        <button type="button" class="rounded-md border border-[var(--brand-color)] px-4 py-2 text-[var(--brand-color)]">Back</button>
        <button type="button" class="rounded-md border border-[var(--brand-color)] px-4 py-2 text-[var(--brand-color)]">Save Draft</button>
        <button type="button" class="rounded-md bg-[var(--brand-color)] px-4 py-2 text-white">Next</button>
      </div>
      <p class="text-red-600">Please fix the errors above.</p>
    </section>
  </div>
</main>
```

The stepper text is bright red for the active step and muted gray for the rest. On small screens, the stepper stacks above the card and remains centered. On larger screens, the card keeps a consistent width and minimum height across all steps so the layout doesn't shift as you progress.

Navigation controls live in a sticky footer so the primary actions remain visible even when the form scrolls. Each button has a minimum tap area of 44×44 px to satisfy mobile accessibility guidelines. Heavy widgets such as the map preview and calendar picker are loaded lazily once their sections expand, keeping the initial payload light on mobile connections.

To reduce visual distraction, the map preview now expands instantly without a height transition, and step changes avoid re-triggering the modal's open animation, resulting in a smoother experience.

The progress stepper is rendered as a plain `nav` element with no layout animations so it no longer collapses and re-expands between steps.
