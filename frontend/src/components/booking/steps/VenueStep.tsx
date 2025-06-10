'use client';
// Show a bottom-sheet picker on small screens so the keyboard doesn't hide the
// options.
import { Controller, Control, FieldValues } from 'react-hook-form';
import { useState } from 'react';
import useIsMobile from '@/hooks/useIsMobile';
import useFocusTrap from '@/hooks/useFocusTrap';

interface Props {
  control: Control<FieldValues>;
}

export default function VenueStep({ control }: Props) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const sheetRef = useFocusTrap(open, () => setOpen(false));
  const options = [
    { label: 'Indoor', value: 'indoor' },
    { label: 'Outdoor', value: 'outdoor' },
    { label: 'Hybrid', value: 'hybrid' },
  ];
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Venue type</label>
      <p className="text-sm text-gray-600">What kind of space?</p>
      <Controller
        name="venueType"
        control={control}
        render={({ field }) => (
          <>
            {isMobile ? (
              <>
                <button
                  type="button"
                  className="border p-3 rounded w-full text-left"
                  onClick={() => setOpen(true)}
                >
                  {field.value ? options.find((o) => o.value === field.value)?.label : 'Select'}
                </button>
                {open && (
                  <div className="fixed inset-0 z-50 flex flex-col">
                    <div
                      className="flex-1 bg-black/30"
                      onClick={() => setOpen(false)}
                      data-testid="overlay"
                    />
                    <div
                      ref={sheetRef}
                      role="dialog"
                      aria-modal="true"
                      className="bg-white p-4 space-y-2 rounded-t-lg"
                    >
                      {options.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          className="w-full p-2 text-left border rounded"
                          onClick={() => {
                            field.onChange(o.value);
                            setOpen(false);
                          }}
                        >
                          {o.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="w-full p-2 mt-2 text-center border rounded"
                        onClick={() => setOpen(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <select className="border p-2 rounded w-full" {...field} autoFocus={!isMobile}>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
      />
      {/* Mobile action buttons are handled by MobileActionBar */}
    </div>
  );
}
