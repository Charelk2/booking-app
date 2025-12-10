// components/chat/MessageThread/ThreadView.tsx
// Presentational layout only – no data fetching or scroll logic here.
import * as React from 'react';

type ThreadViewProps = {
  header?: React.ReactNode;
  list: React.ReactNode; // virtualized list adapter instance
  composer: React.ReactNode;
  indicators?: React.ReactNode; // scroll-2-bottom, typing, etc.
};

export default function ThreadView({ header, list, composer, indicators }: ThreadViewProps) {
  return (
    <div className="flex flex-col w-full h-full min-h-0">
      {header}
      <div className="flex-1 min-h-0 px-3 flex flex-col">
        {list}
      </div>
      {indicators}
      {composer}
    </div>
  );
}