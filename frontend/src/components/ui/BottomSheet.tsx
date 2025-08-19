"use client";
import { Fragment, useEffect, useRef, useId } from 'react';
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
  /**
   * Accessible title for the sheet. Rendered inside `Dialog.Title` and
   * referenced by `aria-labelledby` on the dialog.
   */
  title?: string;
}

export default function BottomSheet({
  open,
  onClose,
  initialFocus,
  children,
  testId,
  desktopCenter = false,
  panelClassName,
  title,
}: BottomSheetProps) {
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();

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
        open={open}
        onClose={handleClose}
        initialFocus={initialFocus}
        data-testid={testId}
        aria-labelledby={title ? titleId : undefined}
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
                  "pointer-events-auto w-full rounded-t-lg bg-white shadow-xl max-h-[90vh] md:max-h-[80vh] flex flex-col min-h-0",
                  desktopCenter && "md:rounded-lg",
                  panelClassName,
                )}
              >
                {title && (
                  <Dialog.Title id={titleId} className="sr-only">
                    {title}
                  </Dialog.Title>
                )}
                {children}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
