'use client';
import clsx from 'clsx';
import { CheckIcon } from '@heroicons/react/24/solid'; // Still include, though it won't be used if noCircles is true

interface StepperProps {
  steps: string[];
  currentStep: number;
  maxStepCompleted?: number;
  onStepClick?: (index: number) => void;
  ariaLabel?: string;
  /** Color style variant */
  variant?: 'brand' | 'neutral'; // 'neutral' will now control the active/inactive text colors
  /** Orientation of the stepper */
  orientation?: 'horizontal' | 'vertical';
  /** Additional classes */
  className?: string;
  /** NEW PROP: If true, steps will render as text only without circles/icons */
  noCircles?: boolean;
}

export default function Stepper({
  steps,
  currentStep,
  maxStepCompleted,
  onStepClick,
  ariaLabel,
  variant = 'neutral', // Changed default to 'neutral' to align with the image's gray text
  orientation = 'horizontal',
  className,
  noCircles = false, // Default to false, but set to true from BookingWizard.tsx for the new design
}: StepperProps) {
  const maxAllowed =
    typeof maxStepCompleted === 'number' ? maxStepCompleted + 1 : currentStep;

  return (
    <nav
      role="list"
      aria-label={ariaLabel || 'Booking progress'}
      className={clsx(
        // Base flex properties for the nav container
        'relative flex px-2',
        orientation === 'vertical'
          ? 'flex-col items-start space-y-4 lg:space-y-6' // Adjust space-y for vertical text steps
          : 'items-center justify-between',
        className, // Any additional classes from parent (e.g., lg:space-y-6)
      )}
    >
      {steps.map((label, i) => {
        const isClickable = !!onStepClick && i <= maxAllowed && i !== currentStep;
        const canButton = !!onStepClick && i <= maxAllowed;
        const isActive = i === currentStep;

        // --- CORE LOGIC FOR NO CIRCLES ---
        const stepDisplay = noCircles ? (
          // When noCircles is true, render only the text with specific styling
          <span
            className={clsx(
              // Consistent font weight for all step labels as per image
              'font-semibold',
            
              // Inactive/completed steps are gray-500
              isActive
                ? 'text-black' 
                : 'text-gray-500',
              // Adjust font size for larger screens if in vertical orientation
              orientation === 'vertical' && 'lg:text-base' // A bit larger text for desktop sidebar
            )}
          >
            {label}
          </span>
        ) : (
          // Original rendering logic for circles (if noCircles is false)
          <>
            <div
              className={clsx(
                'relative flex items-center justify-center w-5 h-5 rounded-full border',
                variant === 'neutral'
                  ? // Neutral variant with circles
                    i < currentStep // Completed (past currentStep)
                    ? 'bg-gray-900 border-2 border-gray-900 text-white'
                    : isActive // Active
                      ? 'bg-white border-2 border-gray-900 text-gray-900'
                      : 'bg-white border-gray-400 text-gray-400' // Inactive
                  : // Brand variant with circles (your original logic)
                    i < currentStep // Completed
                    ? 'bg-[var(--brand-color)] border-2 border-[var(--brand-color)] text-white'
                    : isActive // Active
                      ? 'bg-white border-2 border-[var(--brand-color)] text-[var(--brand-color)]'
                      : 'bg-white border-gray-300 text-gray-400', // Inactive
              )}
            >
              {i < currentStep && <CheckIcon className="w-4 h-4" />}
            </div>
            <span
              className={clsx(
                'mt-1 text-xs font-semibold',
                variant === 'neutral'
                  ? isActive
                    ? 'text-gray-900' // Darker text for neutral active
                    : 'text-gray-500' // Muted text for neutral inactive/completed
                  : isActive
                    ? 'text-[var(--brand-color)]' // Brand color for active
                    : 'text-gray-500', // Muted text for inactive/completed
              )}
            >
              {label}
            </span>
          </>
        );

        // Determine the wrapper for the step content (flex for horizontal/vertical alignment)
        const stepContentWrapper = clsx(
          // For vertical orientation, align items to the start.
          // If noCircles, it's just text stacked. If with circles, align circle+text horizontally.
          orientation === 'vertical' && noCircles
            ? 'flex flex-col items-start' // Stack text vertically
            : orientation === 'vertical' && !noCircles
              ? 'flex items-center space-x-3' // Circle + Text horizontally
              : 'flex flex-col items-center' // Default horizontal with circles (stack circle and text)
        );

        // The actual content to render inside the button or div
        const content = <div className={stepContentWrapper}>{stepDisplay}</div>;

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
                // If vertical, make the button fill width and justify start, otherwise original centering
                orientation === 'vertical'
                  ? 'flex w-full justify-start'
                  : 'flex flex-col items-center', // Original horizontal behavior
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
            className={clsx(
              'cursor-default',
              // Same flex behavior as buttons for non-clickable items
              orientation === 'vertical'
                ? 'flex w-full justify-start'
                : 'flex flex-col items-center', // Original horizontal behavior
            )}
          >
            {content}
          </div>
        );
      })}
    </nav>
  );
}