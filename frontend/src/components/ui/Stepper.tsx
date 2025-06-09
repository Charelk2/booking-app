'use client';
// Keep progress visible on small screens by sticking the stepper below the
// header. This helps users understand where they are in the flow while
// scrolling.
import React from 'react';
import useIsMobile from '@/hooks/useIsMobile';

interface StepperProps {
  steps: string[];
  currentStep: number;
}

export default function Stepper({ steps, currentStep }: StepperProps) {
  const isMobile = useIsMobile();
  const progress = (currentStep / (steps.length - 1)) * 100;

  if (isMobile) {
    return (
      <div className="space-y-1 sticky top-16 z-30 bg-white py-2">
        <div className="flex justify-between text-sm">
          <span>{steps[currentStep]}</span>
          <span>
            {currentStep + 1}/{steps.length}
          </span>
        </div>
        <div
          className="w-full bg-gray-200 rounded h-2"
          role="progressbar"
          aria-valuenow={currentStep}
          aria-valuemin={0}
          aria-valuemax={steps.length - 1}
        >
          <div
            className="bg-indigo-600 h-2 rounded"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center" aria-label="Progress">
        {steps.map((label, i) => (
          <div key={label} className="flex items-center flex-1">
            <div
              className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium ${i <= currentStep ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'}`}
            >
              {i + 1}
            </div>
            <span className="ml-2 text-sm">{label}</span>
            {i < steps.length - 1 && (
              <div className="flex-1 border-t border-gray-200 mx-2" />
            )}
          </div>
        ))}
      </div>
      <div
        className="w-full bg-gray-200 rounded h-2"
        role="progressbar"
        aria-valuenow={currentStep}
        aria-valuemin={0}
        aria-valuemax={steps.length - 1}
      >
        <div
          className="bg-indigo-600 h-2 rounded"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
