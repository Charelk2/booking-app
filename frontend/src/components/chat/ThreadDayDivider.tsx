// frontend/src/components/chat/ThreadDayDivider.tsx
'use client';

import React from 'react';

interface Props {
  label: string;
}

function ThreadDayDivider({ label }: Props) {
  return (
    <div className="flex justify-center my-3 w-full">
      <span className="px-3 text-[11px] text-gray-500 bg-gray-100 rounded-full py-1">
        {label}
      </span>
    </div>
  );
}

export default React.memo(ThreadDayDivider);
