# Layout Components

## MainLayout

`MainLayout` wraps pages with the global header and footer. It accepts:

- `headerAddon?: React.ReactNode` – optional content rendered below the header on the artists listing page.
- `headerFilter?: React.ReactNode` – optional filter control rendered to the right of the full search bar.
- `fullWidthContent?: boolean` – allow content to span the full width.

The search bar and mobile search pill automatically appear on the homepage and on
service provider or category listing pages. When visiting a category route such as
`/category/dj`, the search bar pre-selects that category so users can easily
refine their search.

`MainLayout` uses CSS custom properties to ensure content isn't obscured by
fixed navigation elements:

- `--mobile-bottom-nav-height` pads the bottom of the page so content is never
  hidden behind the mobile navigation bar. This variable is set by
  `MobileBottomNav` and includes any safe‑area inset.
- `--header-height` exposes the sticky header's height (including safe‑area
  inset) so pages can offset anchored content or scroll targets. It is set by
  `Header`.

## Header

`Header` powers the sticky top navigation and search experience. It applies
`pt-safe` to account for device notches and sets the `--header-height` variable
on the document root for layout offsetting.

- `filterControl?: React.ReactNode` – component rendered to the right of the full search bar. It is hidden when the header is compacted.

The filter control is typically an icon button that opens a filtering UI, such as `ServiceProvidersPageHeader` (exported from `ServiceProviderServiceCard.tsx`).

## Footer

`Footer` renders grouped navigation links and social icons using brand colors. On large screens the navigation links are laid out
in two rows and three columns, maintaining a compact grid for easier scanning. It appears on every page wrapped by `MainLayout`.

## NotificationDrawer

`NotificationDrawer` lists recent alerts using `react-window` for virtualization so large
sets render efficiently. The optional "Load more" control meets mobile
accessibility guidelines by providing a minimum touch area of 44×44px and
centering its label within that space.

## MobileMenuDrawer

`MobileMenuDrawer` powers the slide‑in menu on small screens. It uses
Headless UI's `<Dialog.Title>` to supply an accessible name for the dialog.
Each navigation group is wrapped in a `<nav>` with an `aria-label` and links
are rendered inside `<ul>`/`<li>` lists to expose proper semantics to assistive
technologies.

Navigation items accept an optional `icon` component from
`@heroicons/react`. When provided, the icon is rendered next to the link text
and spaced consistently via the shared `navItemClasses` utility. Items are
left-aligned within the drawer for faster scanning.
