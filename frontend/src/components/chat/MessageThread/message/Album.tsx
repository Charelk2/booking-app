// components/chat/MessageThread/message/Album.tsx
import * as React from 'react';

type AlbumItem = { id: number; url: string };

export default function Album({ items, onMediaLoad, onOpenItem }: { items: AlbumItem[]; onMediaLoad?: () => void; onOpenItem?: (index: number) => void }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-1 w-full max-w-[420px]">
      {items.map((it, idx) => (
        <div key={it.id} className="relative w-full" style={{ paddingTop: '66.66%' }}>
          <button
            type="button"
            aria-label="Open image"
            className="absolute inset-0 w-full h-full block"
            onClick={() => onOpenItem?.(idx)}
          >
            <img src={it.url} alt="Image attachment" className="absolute inset-0 w-full h-full object-cover rounded-lg" onLoad={onMediaLoad} />
          </button>
        </div>
      ))}
    </div>
  );
}
