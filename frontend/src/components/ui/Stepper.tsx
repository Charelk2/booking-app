'use client';
import React from 'react';
// Lightweight horizontal progress indicator used by the booking wizard.
// Each step is represented by a small circle and label. The current step
// is highlighted in black while the remaining steps appear gray.

interface StepperProps {
  steps: string[];
  currentStep: number;
  onStepClick?: (index: number) => void;
}

export default function Stepper({ steps, currentStep, onStepClick }: StepperProps) {
  return (
    <div className="flex justify-center space-x-4 my-6" aria-label="Progress">
      {steps.map((label, i) => {
        const content = (
          <>
            <div
              className={`w-3 h-3 rounded-full ${
                i === currentStep ? 'bg-black' : 'bg-gray-300'
              }`}
            />
            <span
              className={`mt-1 ${
                i === currentStep ? 'font-medium text-black' : 'text-gray-400'
              }`}
            >
              {label}
            </span>
          </>
        );

        if (onStepClick) {
          return (
            <button
              type="button"
              key={label}
              onClick={() => i <= currentStep && onStepClick(i)}
              disabled={i > currentStep}
              className={`flex flex-col items-center text-sm focus:outline-none ${
                i > currentStep ? 'cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              {content}
            </button>
          );
        }

        return (
          <div key={label} className="flex flex-col items-center text-sm">
            {content}
          </div>
        );
      })}
    </div>
  );
}
