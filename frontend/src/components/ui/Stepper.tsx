'use client';
import React from 'react';
// Lightweight horizontal progress indicator used by the booking wizard.
// Each step is represented by a small circle and label. The current step
// is highlighted in black while the remaining steps appear gray.

interface StepperProps {
  steps: string[];
  currentStep: number;
}

export default function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <div className="flex justify-center space-x-4 my-6" aria-label="Progress">
      {steps.map((label, index) => (
        <div key={label} className="flex flex-col items-center text-xs">
          <div
            className={`w-4 h-4 rounded-full ${
              index === currentStep ? 'bg-black' : 'bg-gray-300'
            }`}
          />
          <span
            className={`mt-1 ${
              index === currentStep ? 'font-semibold text-black' : 'text-gray-400'
            }`}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
