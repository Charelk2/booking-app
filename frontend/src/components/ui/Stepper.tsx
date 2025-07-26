'use client';
import { motion } from 'framer-motion';
import clsx from 'clsx';

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
  const maxStep =
    typeof maxStepCompleted === 'number' ? maxStepCompleted : currentStep;
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
        const isClickable = !!onStepClick && i <= maxStep && i !== currentStep;
        const isCompleted = i < currentStep;
        const isActive = i === currentStep;
        const circle = (
          <div className="relative flex items-center justify-center">
            <motion.div
              layout
              className={clsx(
                'w-4 h-4 rounded-full z-10',
                isCompleted || isActive
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-200',
              )}
            />
            {isActive && (
              <motion.div
                layout
                className="absolute inset-0 rounded-full ring-2 ring-indigo-400 animate-ping"
              />
            )}
          </div>
        );
        const content = (
          <div
            className="flex flex-col items-center"
            role="listitem"
            aria-current={isActive ? 'step' : undefined}
            aria-disabled={isClickable ? undefined : true}
          >
            {circle}
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
                'flex flex-col items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
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
