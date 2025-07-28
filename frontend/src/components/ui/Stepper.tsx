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
  /** Orientation of the stepper */
  orientation?: 'horizontal' | 'vertical';
  /** Additional classes */
  className?: string;
}

export default function Stepper({
  steps,
  currentStep,
  maxStepCompleted,
  onStepClick,
  ariaLabel,
  variant = 'brand',
  orientation = 'horizontal',
  className,
}: StepperProps) {
  const maxAllowed =
    typeof maxStepCompleted === 'number' ? maxStepCompleted + 1 : currentStep;
  return (
    <motion.nav
      layout
      role="list"
      aria-label={ariaLabel || 'Add service progress'}
      className={clsx(
        'relative flex px-2 mb-8',
        orientation === 'vertical'
          ? 'flex-col items-start space-y-6'
          : 'items-center justify-between',
        className,
      )}
    >
      {/*
       * The previous design used a horizontal line behind the stepper circles.
       * It has been removed for a cleaner look across the booking flow.
       */}
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

        const content = orientation === 'vertical'
          ? (
              <div className="flex items-center space-x-3">
                {circle}
                {labelEl}
              </div>
            )
          : (
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
                'focus:outline-none focus-visible:ring-2',
                orientation === 'vertical'
                  ? 'flex items-center'
                  : 'flex flex-col items-center',
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
            className={clsx(
              'cursor-default',
              orientation === 'vertical'
                ? 'flex items-center'
                : 'flex flex-col items-center',
            )}
          >
            {content}
          </div>
        );
      })}
    </motion.nav>
  );
}
