"use client";
import { Fragment, useEffect, useRef } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import clsx from 'clsx';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  initialFocus?: React.RefObject<HTMLElement>;
  children: React.ReactNode;
  testId?: string;
  desktopCenter?: boolean;
  panelClassName?: string;
}

export default function BottomSheet({
  open,
  onClose,
  initialFocus,
  children,
  testId,
  desktopCenter = false,
  panelClassName,
}: BottomSheetProps) {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement as HTMLElement;
    }
  }, [open]);

  const handleClose = () => {
    onClose();
    previouslyFocused.current?.focus();
  };

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog
        as="div"
        className="fixed inset-0 z-50 overflow-hidden"
        onClose={handleClose}
        initialFocus={initialFocus}
        data-testid={testId}
      >
        <div className="absolute inset-0 overflow-hidden">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="absolute inset-0 bg-gray-600 bg-opacity-75 transition-opacity" />
          </Transition.Child>
          <div
            className={clsx(
              "pointer-events-none fixed inset-x-0 bottom-0 flex max-h-full",
              desktopCenter && "md:inset-0 md:items-center md:justify-center",
            )}
          >
            <Transition.Child
              as={Fragment}
              enter="transform transition ease-in-out duration-300"
              enterFrom="translate-y-full"
              enterTo="translate-y-0"
              leave="transform transition ease-in-out duration-300"
              leaveFrom="translate-y-0"
              leaveTo="translate-y-full"
            >
              <Dialog.Panel
                className={clsx(
                  "pointer-events-auto w-full rounded-t-lg bg-white shadow-xl",
                  desktopCenter && "md:rounded-lg",
                  panelClassName,
                )}
              >
                {children}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
