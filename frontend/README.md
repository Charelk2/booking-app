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

See [../docs/design_guidelines.md](../docs/design_guidelines.md) for a summary of spacing, typography and component styles.

### Loading Indicators

`Spinner` and `SkeletonList` components in `src/components/ui` provide
accessible loading states. They apply `role="status"` and `aria-busy` attributes
so screen readers announce when data is in flight.

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

### Booking Wizard URL Parameters

The `/booking` page requires an `artist_id` query parameter and accepts an optional `service_id` to pre-select a service.

```
/booking?artist_id=123&service_id=456
```

Passing `service_id` skips the service selection step when a user clicks "Request Booking" on a service card.

## Dashboard

The artist dashboard includes a quotes page for managing offers. The `EditQuoteModal` allows artists to modify quote details and price inline without leaving the list. It opens when clicking the "Edit" button next to a pending quote and mirrors the style of `SendQuoteModal`. Both modals now wrap the sound fee, travel fee, discount, accommodation, and expiry fields in accessible labels so screen readers announce each input.

The View Quote modal also generates a quote number automatically, shows today's date and a description box, and positions a compact **Choose template** dropdown next to the title. The **Add Item** button sits beneath the travel fee input. Service, sound, travel, and discount fees use the same horizontal pair layout as custom items, and newly added rows inherit the bordered styling so they visually match the preset fees. The bottom now mirrors the booking Review step, listing base fee, travel and sound costs, taxes and an estimated total above a **Submit Request** button. Future enhancements will include a PDF preview option, currency symbols within each field, and a signature/terms section.

### Artist Listing

The artists page uses a responsive grid that shows one card per row on mobile,
two cards on tablets and three or more on larger screens. Each artist card
displays a skeleton placeholder until the image loads and reveals a **Book
Now** overlay button when hovered. A sticky header hosts the search UI. On
  desktop a segmented bar (`SearchBarInline`) collapses into three segments showing the chosen **Category**, **Location** and **Date**. Clicking anywhere on this bar smoothly expands it into the full homepage search form with identical styling. When expanded the wrapper stays centered with a fixed `md:max-w-4xl` width and a 300ms ease-out transition, while the collapsed pill uses a narrower `md:max-w-2xl` so it takes up about 25% less space. Keyboard users can press **Enter** to search or **Escape** to cancel. On mobile the compact pill opens a `SearchModal`
 bottom sheet while the filter icon opens `FilterSheet`. On larger screens this icon sits to the right of the inline search bar without shifting its centered position. The desktop filter now opens in a white rounded card with a pink range slider and clear/apply buttons, similar to Airbnb.
 Filters show a tiny pink dot when active. The filter icon now sits slightly closer to the pill and automatically hides when the inline bar expands into the full form. All search options and filters persist in the URL so pages can be shared
or refreshed without losing state.

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

