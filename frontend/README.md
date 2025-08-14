This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## UI Theme

Reusable style constants are defined in `src/styles`. Button variants come from
`buttonVariants.ts` so colors stay consistent across the app. The base `Button`
component now uses a `rounded-lg` radius for a softer look. A new `link`
variant provides a text-only style for inline actions. The Tailwind
configuration includes this directory in its `content` array so these constant
class names are preserved during production builds.
All text inputs should use the `TextInput` component in `src/components/ui` so
form fields share consistent spacing and focus styles.
The `Stepper` progress bar highlights the active step with `bg-brand` and `text-brand-dark` to reinforce the brand palette.

Primary, secondary and outline buttons now use the brand color for borders and background with a subtle shadow hover transition.
Icon-only actions should use the `IconButton` component, which requires an
`aria-label` and respects the user's `prefers-reduced-motion` setting to keep
animations subtle for motion-sensitive users.

See [../docs/design_guidelines.md](../docs/design_guidelines.md) for a summary of spacing, typography and component styles.

[STYLE_GUIDE.md](STYLE_GUIDE.md) documents Tailwind breakpoints, CSS variables and UI patterns like `CollapsibleSection` and `BottomSheet`. Update it whenever major UI changes are introduced.
`BottomSheet` accepts a `title` prop that renders an accessible heading via `Dialog.Title` and links to `aria-labelledby`.

### Responsive Breakpoints

The `BREAKPOINT_SM` constant in `breakpoints.config.js` defines the `sm`
screen width for both Tailwind and client-side hooks such as `useIsMobile`.
Importing this shared value keeps style breakpoints and JavaScript logic in
sync, ensuring responsive behavior matches the design system.

### Search Interface

 The global search bar and its compact pill appear only on the home page and the service providers listing page. Service provider detail pages and other routes omit these elements for a cleaner layout. On the service providers listing page, the header loads directly in its compact pill state, preserving any category, date, and location selections from the URL and showing the filter icon beside the pill for quick refinement. Clicking the pill now expands the full SearchBar above the filter controls, and the compact pill mirrors the collapsed SearchBar by displaying any selected category, dates, and location when the full bar is hidden. For addresses, the pill shows only the street name to keep things concise. On mobile devices, the header always starts in this compact mode, displaying a Search button next to the Booka logo that opens the full-screen search when tapped.

Focusing the category chooser opens a popup that spans half of the search bar from the left. The location input opens a suggested-destinations popup on the right half, and selecting dates launches a full-screen calendar overlay. If the suggested destinations exceed the popup height, the list now scrolls so all options remain accessible. Once the user types in a location, the suggestions popup closes and will not reappear, while Google Places autocomplete suggestions show directly beneath the input.

### Homepage Categories Carousel

 The home page includes a "Services Near You" carousel that lists common service categories such as Musicians and DJs. Each category supports its own image, defined in `src/lib/categoryMap.ts` and served from `public/categories`. Items display the image with the label below and link to the service providers page filtered by the selected category. On desktop, left and right buttons page through the list for easier navigation.

### Service Categories

Service categories are fetched from the backend. A generic "Service Providers" entry may be returned but is intentionally hidden in the UI because individual providers can offer services across multiple categories.


### Loading Indicators

`Spinner` and `SkeletonList` components in `src/components/ui` provide
accessible loading states. They apply `role="status"` and `aria-busy` attributes
so screen readers announce when data is in flight.

### Emoji Picker

The chat composer now includes an emoji button that toggles a searchable picker powered by `emoji-mart` and `@emoji-mart/data`. The picker appears above the input so it never obscures the textarea, and the trigger button provides an accessible `aria-label`. The preview pane has been disabled for a cleaner selection experience.

### Customizing Brand Colors

Brand colors are declared in `tailwind.config.js` and exposed as CSS variables in
`globals.css`. Modify these values to change the entire palette:

```javascript
// tailwind.config.js
const colors = require('tailwindcss/colors');
colors: {
  brand: {
    DEFAULT: '#6366f1',
    dark: '#4f46e5',
    light: '#a5b4fc',
  },
  primary: {
    50: '#EEF2FF',
    600: '#4F46E5',
    700: '#4338CA',
  },
  // default Tailwind palettes used for status badges
  orange: colors.orange,
  yellow: colors.yellow,
}
```

```css
/* globals.css */
:root {
  --brand-color: #6366f1;
  --brand-color-dark: #4f46e5;
  --brand-color-light: #a5b4fc;
  --color-accent: #ec4899;
}
```

Updating these values automatically updates button variants and any classes such
as `bg-brand` or `bg-brand-dark`. The accent color is exposed as `--color-accent`
and can be referenced with utilities like `bg-[var(--color-accent)]` or
`text-[var(--color-accent)]`. You can also apply opacity with
`bg-[var(--color-accent)]/10` for lighter status badges. Default Tailwind shades for `orange` and `yellow`
are also included for status badges and warnings.

### Fonts & Global Styles

`globals.css` also defines the base font family using CSS variables. The default
font (`--font-inter`) is provided by `next/font`. The body font size is set to
`16px` for readability. Replace the `--font-inter` variable to use a different
typeface across the site.

### Performance Optimizations

Booking wizard steps load on demand using `next/dynamic`, and heavy chat
components are wrapped with `React.memo` to minimize re-renders. Service and
profile requests in the wizard use App Router caching (`force-cache`) where
safe to reduce network traffic.

### Images & Media

Responsive images use `next/image` with explicit `sizes` so sub-640px screens
receive smaller sources. Images below the fold lazy-load with a low-quality
placeholder to improve perceived performance. Profile picture uploads are
compressed in the browser before being sent to the server to conserve
bandwidth.

### Booking Wizard URL Parameters

The `/booking` page requires an `artist_id` query parameter (the service provider's ID) and accepts an optional `service_id` to pre-select a service.

```
/booking?artist_id=123&service_id=456
```

Passing `service_id` skips the service selection step when a user clicks "Request Booking" on a service card.

### Inbox URL Parameters

The `/inbox` page accepts a `requestId` to open a specific conversation. Service providers now receive a quote summary bubble directly in the thread, so the former `sendQuote=1` flag is no longer supported.

```
/inbox?requestId=42
```

On small screens the inbox initially displays only the conversation list. Tapping a conversation opens the chat thread and hides the list, and a back button returns to the conversation list. Selecting a conversation updates the URL using the History API so the page no longer reloads.

Quote messages within the thread now render as full-width cards showing booking details alongside an itemized quote summary. Clients can accept or reject the quote directly from this bubble without opening a separate modal.

## Dashboard

The service provider dashboard includes a quotes page for managing offers. The `EditQuoteModal` allows service providers to modify quote details and price inline without leaving the list. It opens when clicking the "Edit" button next to a pending quote and uses the shared `BottomSheet` component so it displays full screen on mobile and centered on larger screens. Trigger buttons expose `aria-expanded` and focus returns after closing. Sound, travel, discount, accommodation, and expiry fields remain wrapped in accessible labels so screen readers announce each input.

Helper hooks `useSendQuote`, `useAcceptQuote`, and `useDeclineQuote` are available for interacting with quote endpoints in components and pages.

The View Quote modal also generates a quote number automatically, shows today's date and a description box, and positions a compact **Choose template** dropdown next to the title. The **Add Item** button sits beneath the travel fee input. Service, sound, travel, and discount fees use the same horizontal pair layout as custom items, and newly added rows inherit the bordered styling so they visually match the preset fees. The bottom now mirrors the booking Review step, listing base fee, travel and sound costs, taxes and an estimated total above a **Submit Request** button. Future enhancements will include a PDF preview option, currency symbols within each field, and a signature/terms section.

### Service Provider Listing

The service providers page uses a responsive grid that shows one card per row on mobile,
 two cards on tablets and three or more on larger screens. Each service provider card
 displays a skeleton placeholder until the image loads and reveals a **Book
 Now** overlay button when hovered. A sticky header hosts the search UI. On
 desktop the header includes a compact pill that collapses into three segments
 showing the chosen **Category**, **Location** and **Date**. Clicking the pill
 expands it into the full homepage search form with identical styling. The
 wrapper stays centered with a fixed `md:max-w-4xl` width and a 300ms ease-out
 transition, while the collapsed pill uses a narrower `md:max-w-2xl` so it takes
 up about 25% less space. Keyboard users can press **Enter** to search or
 **Escape** to cancel. On mobile the compact pill opens a `SearchModal` bottom
 sheet while the filter icon opens `FilterSheet`. All search options and filters
persist in the URL so pages can be shared or refreshed without losing state.

### Service Provider Detail Layout

Individual service provider profile pages use a split-screen layout on desktop. A static left
panel keeps the cover image and key contact details visible, while the right
panel scrolls independently with services, portfolio links and reviews. On
smaller screens the panels stack vertically for a conventional mobile flow.

## Testing

Run `npm test` when you only want to execute the frontend Jest suite. The `pretest` script defined in
`package.json` automatically installs dependencies if the `node_modules` directory is missing, so the
tests can run even on a clean checkout.

To run both the backend and frontend tests, use the project-wide script located one directory up:

```bash
../scripts/test-all.sh
```

That command invokes the Python unit tests and then runs the same `npm test` command as above, so you
get full coverage across the entire application.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

