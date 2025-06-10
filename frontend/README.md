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
`buttonVariants.ts` so colors stay consistent across the app. The Tailwind
configuration includes this directory in its `content` array so these constant
class names are preserved during production builds.

### Customizing Brand Colors

Brand colors are declared in `tailwind.config.js` and exposed as CSS variables in
`globals.css`. Modify these values to change the entire palette:

```javascript
// tailwind.config.js
colors: {
  brand: {
    DEFAULT: '#7c3aed',
    dark: '#6d28d9',
    light: '#c084fc',
  },
}
```

```css
/* globals.css */
:root {
  --brand-color: #7c3aed;
  --brand-color-dark: #6d28d9;
  --brand-color-light: #c084fc;
}
```

Updating these values automatically updates button variants and any classes such
as `bg-brand` or `bg-brand-dark`.

### Fonts & Global Styles

`globals.css` also defines the base font family using CSS variables. The default
font (`--font-inter`) is provided by `next/font`. Replace this variable to use a
different typeface across the site.

### Booking Wizard URL Parameters

The `/booking` page requires an `artist_id` query parameter and accepts an optional `service_id` to pre-select a service.

```
/booking?artist_id=123&service_id=456
```

Passing `service_id` skips the service selection step when a user clicks "Book Now" on a service card.

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

