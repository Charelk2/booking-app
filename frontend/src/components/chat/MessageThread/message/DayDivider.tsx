// components/chat/MessageThread/message/DayDivider.tsx
import * as React from 'react';

export default function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex justify-center my-2 w-full">
      <span className="px-3 py-0.5 text-[11px] text-gray-600 bg-gray-100 rounded-full">{label}</span>
    </div>
  );
}

