'use client';
import React from 'react';
// Simplified progress bar that highlights the current step and shows
// past steps as semi-active. The bar sticks below the header on mobile
// so progress stays visible while scrolling.
import useIsMobile from '@/hooks/useIsMobile';

interface StepperProps {
  steps: string[];
  currentStep: number;
}

export default function Stepper({ steps, currentStep }: StepperProps) {
  const isMobile = useIsMobile();

  return (
    <div className={`sticky top-16 z-30 bg-white py-2 ${isMobile ? '' : 'mb-4'}`}> 
      <div className="flex items-center" aria-label="Progress">
        {steps.map((label, i) => {
          const state = i < currentStep ? 'past' : i === currentStep ? 'current' : 'future';
          const circleClass =
            state === 'current'
              ? 'bg-indigo-600 text-white'
              : state === 'past'
                ? 'bg-indigo-100 text-indigo-600'
                : 'bg-gray-200 text-gray-400';
          const textClass =
            state === 'current'
              ? 'font-bold text-gray-900'
              : state === 'past'
                ? 'text-gray-700'
                : 'text-gray-400';
          return (
            <div key={label} className="flex items-center flex-1">
              <div className={`h-4 w-4 rounded-full ${circleClass}`} />
              <span className={`ml-2 text-xs sm:text-sm ${textClass}`}>{label}</span>
              {i < steps.length - 1 && (
                <div className="flex-1 border-t border-gray-300 mx-2" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
