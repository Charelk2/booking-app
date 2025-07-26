'use client';
import React, { useMemo } from 'react';
export function computeProfileCompleteness(stepsCompleted: number, totalSteps: number): number {
  if (totalSteps <= 0) return 0;
  return Math.round((stepsCompleted / totalSteps) * 100);
}

interface ProfileCompletenessProps {
  stepsCompleted: number;
  totalSteps: number;
}

export default function ProfileCompleteness({ stepsCompleted, totalSteps }: ProfileCompletenessProps) {
  const percentage = useMemo(
    () => computeProfileCompleteness(stepsCompleted, totalSteps),
    [stepsCompleted, totalSteps],
  );

  return (
    <div className="w-full" data-testid="profile-completeness-wrapper">
      <div className="flex justify-between text-sm mb-1">
        <span>Profile Completion</span>
        <span>{percentage}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2" data-testid="profile-completeness">
        <div className="h-2 rounded-full bg-[var(--color-accent)]" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
