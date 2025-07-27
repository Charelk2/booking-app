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
  /** Color style variant */
  variant?: 'brand' | 'neutral';
}

export default function Stepper({
  steps,
  currentStep,
  maxStepCompleted,
  onStepClick,
  ariaLabel,
  variant = 'brand',
}: StepperProps) {
  const maxAllowed =
    typeof maxStepCompleted === 'number' ? maxStepCompleted + 1 : currentStep;
  return (
    <motion.nav
      layout
      role="list"
      aria-label={ariaLabel || 'Add service progress'}
      className="relative flex items-center justify-between px-2 mb-8"
    >
      <motion.div
        layout
        className="absolute left-0 right-0 top-1/2 h-px bg-gray-200"
        aria-hidden="true"
      />
      {steps.map((label, i) => {
        const isClickable = !!onStepClick && i <= maxAllowed && i !== currentStep;
        const canButton = !!onStepClick && i <= maxAllowed;
        const isCompleted = i < currentStep;
        const isActive = i === currentStep;

        const circle = (
          <div
            className={clsx(
              'relative flex items-center justify-center w-5 h-5 rounded-full border',
              variant === 'neutral'
                ? isCompleted
                  ? 'bg-gray-900 border-2 border-gray-900 text-white'
                  : isActive
                    ? 'bg-white border-2 border-gray-900 text-gray-900'
                    : 'bg-white border-gray-400 text-gray-400'
                : isCompleted
                  ? 'bg-[var(--brand-color)] border-2 border-[var(--brand-color)] text-white'
                  : isActive
                    ? 'bg-white border-2 border-[var(--brand-color)] text-[var(--brand-color)]'
                    : 'bg-white border-gray-300 text-gray-400',
            )}
          >
            {isCompleted && <CheckIcon className="w-4 h-4" />}
          </div>
        );

        const labelEl = (
          <span
            className={clsx(
              'mt-1 text-xs font-semibold',
              variant === 'neutral'
                ? isActive
                  ? 'text-gray-900'
                  : 'text-gray-500'
                : isActive
                  ? 'text-[var(--brand-color)]'
                  : 'text-gray-500',
            )}
          >
            {label}
          </span>
        );

        const content = (
          <div className="flex flex-col items-center">
            {circle}
            {labelEl}
          </div>
        );
        if (canButton) {
          return (
            <button
              type="button"
              key={label}
              onClick={() => isClickable && onStepClick?.(i)}
              disabled={!isClickable}
              aria-current={isActive ? 'step' : undefined}
              aria-disabled={!isClickable ? 'true' : undefined}
              className={clsx(
                'flex flex-col items-center focus:outline-none focus-visible:ring-2',
                variant === 'neutral'
                  ? 'focus-visible:ring-gray-700'
                  : 'focus-visible:ring-[var(--brand-color-dark)]',
                isClickable ? 'cursor-pointer' : 'cursor-default',
              )}
            >
              {content}
            </button>
          );
        }
        return (
          <div
            key={label}
            role="listitem"
            aria-current={isActive ? 'step' : undefined}
            aria-disabled="true"
            className="flex flex-col items-center cursor-default"
          >
            {content}
          </div>
        );
      })}
    </motion.nav>
  );
}
