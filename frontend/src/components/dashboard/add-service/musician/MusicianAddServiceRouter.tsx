"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import {
  MusicalNoteIcon,
  VideoCameraIcon,
  SparklesIcon,
  SquaresPlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { ElementType } from "react";
import clsx from "clsx";

import type { Service } from "@/types";
import MusicianPersonalizedVideoFlow from "./MusicianPersonalizedVideoFlow";
import MusicianCustomSongFlow from "./MusicianCustomSongFlow";
import MusicianOtherFlow from "./MusicianOtherFlow";
import MusicianLivePerformanceFlow from "./MusicianLivePerformanceFlow";

type MusicianRouterProps = {
  isOpen: boolean;
  onClose: () => void;
  onServiceSaved: (svc: Service) => void;
  service?: Service;
};

const serviceTypeIcons: Record<Service["service_type"], ElementType> = {
  "Live Performance": MusicalNoteIcon,
  "Virtual Appearance": VideoCameraIcon,
  "Personalized Video": VideoCameraIcon,
  "Custom Song": SparklesIcon,
  Other: SquaresPlusIcon,
};

export default function MusicianAddServiceRouter({
  isOpen,
  onClose,
  onServiceSaved,
  service,
}: MusicianRouterProps) {
  const [mode, setMode] = useState<
    "selector" | "pv" | "custom_song" | "other" | "live"
  >("selector");
  const [selectedType, setSelectedType] = useState<
    Service["service_type"] | null
  >(null);

  const initialTypeFromService = useMemo<Service["service_type"] | null>(
    () => service?.service_type ?? null,
    [service],
  );

  useEffect(() => {
    if (!isOpen) {
      setMode("selector");
      setSelectedType(null);
      return;
    }
    if (initialTypeFromService === "Personalized Video") {
      setMode("pv");
      setSelectedType("Personalized Video");
    } else if (initialTypeFromService === "Live Performance") {
      setMode("live");
      setSelectedType("Live Performance");
    } else if (initialTypeFromService === "Custom Song") {
      setMode("custom_song");
      setSelectedType("Custom Song");
    } else if (initialTypeFromService === "Other") {
      setMode("other");
      setSelectedType("Other");
    } else {
      setMode("selector");
      setSelectedType(null);
    }
  }, [isOpen, initialTypeFromService]);

  const handleSelectType = (type: Service["service_type"]) => {
    setSelectedType(type);
    if (type === "Personalized Video") setMode("pv");
    else if (type === "Custom Song") setMode("custom_song");
    else if (type === "Other") setMode("other");
    else if (type === "Live Performance") setMode("live");
    else setMode("selector");
  };

  const handleCloseAll = () => {
    setMode("selector");
    setSelectedType(null);
    onClose();
  };

  const typeOptions: { value: Service["service_type"]; label: string }[] = [
    { value: "Live Performance", label: "Live Performance" },
    { value: "Personalized Video", label: "Personalised Video" },
    { value: "Custom Song", label: "Custom Song" },
    { value: "Other", label: "Other" },
  ];

  return (
    <>
      <Transition show={isOpen && mode === "selector"} as={Fragment}>
        <Dialog
          as="div"
          className="fixed inset-0 z-50"
          open={isOpen && mode === "selector"}
          onClose={handleCloseAll}
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
            <div
              className="fixed inset-0 z-40 bg-gray-500/75"
              aria-hidden="true"
            />
          </Transition.Child>
          <div className="fixed inset-0 z-50 flex p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="relative m-auto w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl">
                <button
                  type="button"
                  onClick={handleCloseAll}
                  className="absolute right-4 top-4 rounded-md p-2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
                <h2 className="mb-4 text-xl font-semibold">
                  Choose your service type
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {typeOptions.map(({ value, label }) => {
                    const Icon = serviceTypeIcons[value];
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleSelectType(value)}
                        className={clsx(
                          "flex flex-col items-center justify-center rounded-xl border p-4 text-sm transition",
                          selectedType === value
                            ? "border-2 border-[var(--brand-color)]"
                            : "border-gray-200 hover:border-gray-300",
                        )}
                      >
                        {Icon && <Icon className="mb-1 h-6 w-6" />}
                        <span className="text-sm font-medium text-gray-800">
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>

      <MusicianPersonalizedVideoFlow
        isOpen={isOpen && mode === "pv"}
        onClose={handleCloseAll}
        onServiceSaved={onServiceSaved}
        service={initialTypeFromService === "Personalized Video" ? service : undefined}
      />

      <MusicianLivePerformanceFlow
        isOpen={isOpen && mode === "live"}
        onClose={handleCloseAll}
        onServiceSaved={onServiceSaved}
        service={initialTypeFromService === "Live Performance" ? service : undefined}
      />

      <MusicianCustomSongFlow
        isOpen={isOpen && mode === "custom_song"}
        onClose={handleCloseAll}
        onServiceSaved={onServiceSaved}
        service={initialTypeFromService === "Custom Song" ? service : undefined}
      />

      <MusicianOtherFlow
        isOpen={isOpen && mode === "other"}
        onClose={handleCloseAll}
        onServiceSaved={onServiceSaved}
        service={initialTypeFromService === "Other" ? service : undefined}
      />
    </>
  );
}
