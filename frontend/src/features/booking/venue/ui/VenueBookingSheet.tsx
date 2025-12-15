"use client";

import { Dialog, Transition } from "@headlessui/react";
import { Fragment, useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

import Button from "@/components/ui/Button";
import { TextArea, TextInput } from "@/components/ui";
import type { Service } from "@/types";
import { useVenueBookingEngine } from "@/features/booking/venue/engine/engine";

type VenueBookingSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  serviceProviderId: number;
  service: Service;
};

export default function VenueBookingSheet({
  isOpen,
  onClose,
  serviceProviderId,
  service,
}: VenueBookingSheetProps) {
  const engine = useVenueBookingEngine({
    serviceProviderId,
    serviceId: service.id,
  });

  useEffect(() => {
    if (!isOpen) return;
    engine.actions.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (engine.state.booking.status === "submitted" && engine.state.booking.requestId) {
      onClose();
    }
  }, [engine.state.booking.status, engine.state.booking.requestId, isOpen, onClose]);

  const capacityHint = (() => {
    const cap = (service as any)?.details?.capacity;
    const n = Number(cap);
    return Number.isFinite(n) && n > 0 ? `Capacity: ${n}` : null;
  })();

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="fixed inset-0 z-[70]"
        open={isOpen}
        onClose={onClose}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
        </Transition.Child>

        <div className="fixed inset-0 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
          >
            <Dialog.Panel className="w-full max-w-2xl rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
              <div className="flex items-start justify-between border-b border-gray-100 p-4">
                <div>
                  <Dialog.Title className="text-lg font-semibold text-gray-900">
                    Request to book
                  </Dialog.Title>
                  <p className="mt-1 text-sm text-gray-600">
                    {(service?.title || "Venue").trim()}
                    {capacityHint ? ` · ${capacityHint}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-2 hover:bg-gray-50"
                  aria-label="Close"
                >
                  <XMarkIcon className="h-5 w-5 text-gray-600" />
                </button>
              </div>

              <div className="space-y-4 p-4">
                <TextInput
                  label="Date"
                  type="date"
                  value={engine.state.form.date}
                  onChange={(e) => engine.actions.setDate(e.target.value)}
                />
                <TextInput
                  label="Estimated guests"
                  type="number"
                  value={engine.state.form.guests}
                  onChange={(e) => engine.actions.setGuests(e.target.value)}
                />
                <TextArea
                  label="Notes (optional)"
                  rows={4}
                  value={engine.state.form.notes}
                  onChange={(e) => engine.actions.setNotes(e.target.value)}
                  placeholder="Tell the venue about your event (timing, setup, special requirements)…"
                />

                {engine.state.booking.error ? (
                  <p className="text-sm text-red-600" role="alert">
                    {engine.state.booking.error}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-gray-100 p-4">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  onClick={() => engine.actions.submit()}
                  isLoading={engine.state.booking.status === "submitting"}
                >
                  Send request
                </Button>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}
