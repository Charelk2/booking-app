// components/chat/MessageThread/message/Album.tsx
import * as React from 'react';

export type AlbumItem = {
  id: number;
  url: string;
};

export type AlbumProps = {
  items: AlbumItem[];
  onMediaLoad?: () => void;
  onOpenItem?: (index: number) => void;
  className?: string;
};

const MAX_TILES = 4;

const AlbumComponent: React.FC<AlbumProps> = ({
  items,
  onMediaLoad,
  onOpenItem,
  className = '',
}) => {
  if (!Array.isArray(items) || items.length === 0) return null;

  const visible = items.slice(0, MAX_TILES);
  const extraCount = items.length > MAX_TILES ? items.length - MAX_TILES : 0;
  const hasExtra = extraCount > 0;

  const gridColsClass = visible.length === 1 ? 'grid-cols-1' : 'grid-cols-2';

  return (
    <div
      className={[
        'w-full max-w-[420px] overflow-hidden rounded-xl',
        'bg-black/5 dark:bg-white/5',
        'shadow-sm',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={`grid ${gridColsClass} gap-0.5`}>
        {visible.map((item, index) => {
          const isLastVisible = index === visible.length - 1;
          const showExtraOverlay = isLastVisible && hasExtra;

          const baseLabel = `Open image ${index + 1} of ${items.length}`;
          const ariaLabel = showExtraOverlay
            ? `${baseLabel}, plus ${extraCount} more`
            : baseLabel;

          return (
            <div
              key={item.id}
              className="relative w-full overflow-hidden"
              style={{ paddingTop: '66.66%' }} // ~3:2 aspect ratio
            >
              <button
                type="button"
                aria-label={ariaLabel}
                className={[
                  'group absolute inset-0 block h-full w-full',
                  'focus-visible:outline-none',
                  'focus-visible:ring-2 focus-visible:ring-offset-2',
                  'focus-visible:ring-white/80 focus-visible:ring-offset-black/60',
                  'active:scale-[0.98] transition-transform duration-100 ease-out',
                  'touch-manipulation',
                  'rounded-lg',
                ].join(' ')}
                onClick={() => onOpenItem?.(index)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt="Image attachment"
                  loading="lazy"
                  draggable={false}
                  className={[
                    'absolute inset-0 h-full w-full object-cover rounded-lg',
                    'transition-transform duration-150 ease-out',
                    'group-hover:scale-[1.03] group-active:scale-[0.97]',
                  ].join(' ')}
                  onLoad={onMediaLoad}
                />

                {/* subtle border to separate from chat bubble background */}
                <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-black/5 dark:ring-white/10" />

                {showExtraOverlay && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/45">
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
    </div>
  );
};

AlbumComponent.displayName = 'Album';

export default React.memo(AlbumComponent);
