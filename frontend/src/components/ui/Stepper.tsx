'use client';
import React from 'react';
// Lightweight horizontal progress indicator used by the booking wizard.
// Each step is represented by a small circle and label. The current step
// is highlighted in black while the remaining steps appear gray.

interface StepperProps {
  steps: string[];
  currentStep: number;
  maxStepCompleted?: number;
  onStepClick?: (index: number) => void;
}

export default function Stepper({ steps, currentStep, maxStepCompleted, onStepClick }: StepperProps) {
  return (
    <div className="flex justify-center space-x-4 my-6" aria-label="Progress" role="list">
      {steps.map((label, i) => {
        const content = (
          <>
            <div
              className={`w-3 h-3 rounded-full ${
                i === currentStep ? 'bg-brand' : 'bg-gray-300'
              }`}
            />
            <span
              className={`mt-1 ${
                i === currentStep
                  ? 'font-medium text-brand-dark'
                  : 'text-gray-400'
              }`}
            >
              {label}
            </span>
          </>
        );

        const maxStep =
          typeof maxStepCompleted === 'number' ? maxStepCompleted : currentStep;
        const isClickable = !!onStepClick && i <= maxStep && i !== currentStep;

        if (onStepClick) {
          return (
            <button
              type="button"
              key={label}
              role="listitem"
              aria-current={i === currentStep ? 'step' : undefined}
              aria-disabled={isClickable ? undefined : true}
              onClick={() => isClickable && onStepClick(i)}
              disabled={!isClickable}
              className={`flex flex-col items-center text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                !isClickable && i !== currentStep
                  ? 'cursor-not-allowed'
                  : i === currentStep
                    ? 'cursor-default'
                    : 'cursor-pointer'
              }`}
            >
              {content}
            </button>
          );
        }

        return (
          <div
            key={label}
            role="listitem"
            aria-current={i === currentStep ? 'step' : undefined}
            aria-disabled="true"
            className="flex flex-col items-center text-sm"
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
