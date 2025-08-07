# Layout Components

## MainLayout

`MainLayout` wraps pages with the global header and footer. It accepts:

- `headerAddon?: React.ReactNode` – optional content rendered below the header on the artists listing page.
- `headerFilter?: React.ReactNode` – optional filter control rendered to the right of the full search bar.
- `fullWidthContent?: boolean` – allow content to span the full width.

`MainLayout` uses the CSS custom property `--mobile-bottom-nav-height` to
automatically pad the bottom of the page so content is never hidden behind the
mobile navigation bar. This variable is set by `MobileBottomNav` and includes
any safe‑area inset.

## Header

`Header` powers the sticky top navigation and search experience.

- `filterControl?: React.ReactNode` – component rendered to the right of the full search bar. It is hidden when the header is compacted.

The filter control is typically an icon button that opens a filtering UI, such as `ArtistsPageHeader`.

## Footer

`Footer` renders grouped navigation links and social icons using brand colors. On large screens the navigation links are laid out
in two rows and three columns, maintaining a compact grid for easier scanning. It appears on every page wrapped by `MainLayout`.

## NotificationDrawer

`NotificationDrawer` lists recent alerts using `react-window` for virtualization so large
sets render efficiently. The optional "Load more" control meets mobile
accessibility guidelines by providing a minimum touch area of 44×44px and
centering its label within that space.
