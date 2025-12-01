// components/chat/MessageThread/message/Album.tsx
import * as React from 'react';

type AlbumItem = { id: number; url: string };

export default function Album({ items, onMediaLoad, onOpenItem }: { items: AlbumItem[]; onMediaLoad?: () => void; onOpenItem?: (index: number) => void }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const maxTiles = 4;
  const visible = items.slice(0, maxTiles);
  const extraCount = items.length > maxTiles ? items.length - maxTiles : 0;
  return (
    <div className="grid grid-cols-2 gap-1 w-full max-w-[420px]">
      {visible.map((it, idx) => {
        const isLast = idx === visible.length - 1 && extraCount > 0;
        return (
          <div key={it.id} className="relative w-full" style={{ paddingTop: '66.66%' }}>
            <button
              type="button"
              aria-label="Open image"
              className="absolute inset-0 w-full h-full block"
              onClick={() => onOpenItem?.(idx)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={it.url}
                alt="Image attachment"
                className="absolute inset-0 w-full h-full object-cover rounded-lg"
                onLoad={onMediaLoad}
              />
              {isLast && (
                <div className="absolute inset-0 rounded-lg bg-black/40 flex items-center justify-center">
                  <span className="px-3 py-1.5 rounded-full bg-black/70 text-white text-sm font-semibold">
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
}
