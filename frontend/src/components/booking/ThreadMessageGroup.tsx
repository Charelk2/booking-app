// frontend/src/components/booking/ThreadMessageGroup.tsx
'use client';

import React from 'react';
import ThreadDayDivider from './ThreadDayDivider';

interface Props {
  dayLabel?: string | null;
  children: React.ReactNode;
}

function ThreadMessageGroup({ dayLabel, children }: Props) {
  return (
    <>
      {dayLabel ? <ThreadDayDivider label={dayLabel} /> : null}
      {children}
    </>
  );
}

export default React.memo(ThreadMessageGroup);
