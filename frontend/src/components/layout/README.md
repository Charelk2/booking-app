# Layout Components

## MainLayout

`MainLayout` wraps pages with the global header and footer. It accepts:

- `headerAddon?: React.ReactNode` – optional content rendered below the header on the artists listing page.
- `headerFilter?: React.ReactNode` – optional filter control rendered to the right of the full search bar.
- `fullWidthContent?: boolean` – allow content to span the full width.

## Header

`Header` powers the sticky top navigation and search experience.

- `filterControl?: React.ReactNode` – component rendered to the right of the full search bar. It is hidden when the header is compacted.

The filter control is typically an icon button that opens a filtering UI, such as `ArtistsPageHeader`.

## Footer

`Footer` renders grouped navigation links and social icons using brand colors. On large screens the navigation links sit on the
right side of the page in a two-row, three-column grid for easier scanning. It appears on every page wrapped by `MainLayout`.
