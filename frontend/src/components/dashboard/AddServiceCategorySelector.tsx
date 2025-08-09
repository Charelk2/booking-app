"use client";

import { Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import {
  XMarkIcon,
  MusicalNoteIcon,
  CameraIcon,
  VideoCameraIcon,
  SpeakerWaveIcon,
  MegaphoneIcon,
  SparklesIcon,
  HomeModernIcon,
  CakeIcon,
  BeakerIcon,
  MicrophoneIcon,
} from "@heroicons/react/24/outline";

interface Category {
  id: string;
  label: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const categories: Category[] = [
  { id: "musician", label: "Musician", Icon: MusicalNoteIcon },
  { id: "dj", label: "DJ", Icon: SpeakerWaveIcon },
  { id: "photographer", label: "Photographer", Icon: CameraIcon },
  { id: "videographer", label: "Videographer", Icon: VideoCameraIcon },
  { id: "speaker", label: "Speaker", Icon: MegaphoneIcon },
  { id: "event_service", label: "Event Service", Icon: SparklesIcon },
  { id: "wedding_venue", label: "Wedding Venue", Icon: HomeModernIcon },
  { id: "caterer", label: "Caterer", Icon: CakeIcon },
  { id: "bartender", label: "Bartender", Icon: BeakerIcon },
  { id: "mc_host", label: "MC & Host", Icon: MicrophoneIcon },
];

interface AddServiceCategorySelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (categoryId: string) => void;
}

export default function AddServiceCategorySelector({
  isOpen,
  onClose,
  onSelect,
}: AddServiceCategorySelectorProps) {
  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog onClose={onClose} className="fixed inset-0 z-50">
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 z-0 bg-black/30" />
        </Transition.Child>

        <Dialog.Panel className="relative z-10 flex h-full w-full flex-col bg-white">
          <div className="flex items-center justify-between p-6">
            <Dialog.Title className="text-2xl font-semibold">
              Booka
            </Dialog.Title>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 hover:bg-gray-100"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-20">
            <h2 className="mb-28 text-center text-4xl font-bold">Choose your line of work</h2>
            <div className="grid grid-cols-5 grid-rows-2 gap-4">
              {categories.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  data-testid={`category-${id}`}
                  onClick={() => {
                    onSelect(id);
                    onClose();
                  }}
                  className="flex flex-col items-center justify-center rounded border p-4 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <Icon className="mb-2 h-8 w-8" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </Dialog.Panel>
      </Dialog>
    </Transition>
  );
}