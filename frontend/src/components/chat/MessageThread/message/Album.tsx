// components/chat/MessageThread/message/Album.tsx
import * as React from 'react';
import clsx from 'clsx';

export type AlbumItem = {
  id: number;
  url: string;
  alt?: string;
  ariaLabel?: string;
};

export type AlbumProps = {
  items: AlbumItem[];
  onMediaLoad?: () => void;
  onOpenItem?: (index: number) => void;
  className?: string;
  aspectRatio?: number; // width / height
  objectFit?: 'cover' | 'contain';
};

const MAX_TILES = 4;
const DEFAULT_ASPECT_RATIO = 3 / 2;

const AlbumComponent: React.FC<AlbumProps> = ({
  items,
  onMediaLoad,
  onOpenItem,
  className,
  aspectRatio = DEFAULT_ASPECT_RATIO,
  objectFit = 'cover',
}) => {
  if (!Array.isArray(items) || items.length === 0) return null;

  const ratio = aspectRatio > 0 ? aspectRatio : DEFAULT_ASPECT_RATIO;
  const paddingTop = `${(1 / ratio) * 100}%`;
  const visible = items.slice(0, MAX_TILES);
  const extraCount = Math.max(0, items.length - MAX_TILES);
  const hasExtra = extraCount > 0;
  const gridCols = visible.length === 1 ? 'grid-cols-1' : 'grid-cols-2';
  const objectFitClass = objectFit === 'contain' ? 'object-contain' : 'object-cover';

  return (
    <div className={clsx('grid w-full max-w-[420px] gap-1', gridCols, className)}>
      {visible.map((item, index) => {
        const absoluteIndex = items.findIndex((candidate) => candidate.id === item.id);
        const itemIndex = absoluteIndex === -1 ? index : absoluteIndex;
        const showExtraOverlay = hasExtra && index === visible.length - 1;

        const description = item.alt?.trim();
        const labelBase =
          item.ariaLabel?.trim() ||
          (description
            ? `${description} (image ${itemIndex + 1} of ${items.length})`
            : `Open image ${itemIndex + 1} of ${items.length}`);
        const ariaLabel = showExtraOverlay ? `${labelBase}, plus ${extraCount} more` : labelBase;

        const altText = description || 'Image attachment';

        return (
          <div key={item.id} className="relative w-full" style={{ paddingTop }}>
            <button
              type="button"
              aria-label={ariaLabel}
              className={clsx(
                'group absolute inset-0 block h-full w-full rounded-lg',
                'focus-visible:outline-none',
                'focus-visible:ring-2 focus-visible:ring-offset-2',
                'focus-visible:ring-white/80 focus-visible:ring-offset-black/60',
                'active:scale-[0.98] transition-transform duration-100 ease-out',
                'touch-manipulation',
              )}
              onClick={() => onOpenItem?.(itemIndex)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={altText}
                loading="lazy"
                draggable={false}
                className={clsx(
                  'absolute inset-0 h-full w-full rounded-lg',
                  objectFitClass,
                  'transition-transform duration-150 ease-out',
                  'group-hover:scale-[1.03] group-active:scale-[0.97]',
                )}
                onLoad={onMediaLoad}
              />

              <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-black/5 dark:ring-white/10" />

              {showExtraOverlay && (
                <div
                  className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/45"
                  aria-hidden="true"
                >
                  <span className="rounded-full bg-black/80 px-3 py-1.5 text-sm font-semibold text-white">
                    +{extraCount}
                  </span>
                </div>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
};

AlbumComponent.displayName = 'Album';

export default React.memo(AlbumComponent);
