'use client';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { CheckIcon } from '@heroicons/react/24/solid';

interface StepperProps {
  steps: string[];
  currentStep: number;
  maxStepCompleted?: number;
  onStepClick?: (index: number) => void;
  ariaLabel?: string;
}

export default function Stepper({
  steps,
  currentStep,
  maxStepCompleted,
  onStepClick,
  ariaLabel,
}: StepperProps) {
  const maxStepAllowed =
    typeof maxStepCompleted === 'number' ? maxStepCompleted + 1 : currentStep + 1;
  return (
    <motion.div
      layout
      role="list"
      aria-label={ariaLabel || 'Progress'}
      className="relative flex items-center justify-between px-2 mb-8"
    >
      <motion.div
        layout
        className="absolute left-0 right-0 top-1/2 h-px bg-gray-200"
        aria-hidden="true"
      />
      {steps.map((label, i) => {
        const isClickable = !!onStepClick && i <= maxStepAllowed && i !== currentStep;
        const isCompleted = i < currentStep;
        const isActive = i === currentStep;

        const circle = (
          <div
            className={clsx(
              'relative flex items-center justify-center w-5 h-5 rounded-full border',
              isCompleted
                ? 'bg-green-600 border-green-600 text-white'
                : isActive
                  ? 'bg-white border-[var(--brand-color)] text-[var(--brand-color-dark)]'
                  : 'bg-gray-200 border-gray-200 text-gray-400',
            )}
          >
            {isCompleted && <CheckIcon className="w-4 h-4" />}
          </div>
        );

        const labelEl = (
          <span
            className={clsx(
              'mt-1 text-sm font-medium',
              isCompleted
                ? 'text-gray-800'
                : isActive
                  ? 'text-[var(--brand-color-dark)] underline decoration-[var(--brand-color-dark)] decoration-4 underline-offset-8'
                  : 'text-gray-400',
            )}
          >
            {label}
          </span>
        );

        const content = (
          <div
            className="flex flex-col items-center"
            role="listitem"
            aria-current={isActive ? 'step' : undefined}
            aria-disabled={isClickable ? undefined : true}
          >
            {circle}
            {labelEl}
          </div>
        );
        if (onStepClick) {
          return (
            <button
              type="button"
              key={label}
              onClick={() => isClickable && onStepClick(i)}
              disabled={!isClickable}
              aria-disabled={isClickable ? undefined : true}
              className={clsx(
                'flex flex-col items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-color-dark)]',
                isClickable ? 'cursor-pointer' : 'cursor-default',
              )}
            >
              {content}
            </button>
          );
        }
        return content;
      })}
    </motion.div>
  );
}
