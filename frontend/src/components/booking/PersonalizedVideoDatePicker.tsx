'use client';

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import { startOfDay, isBefore, format, isSameDay, addDays } from "date-fns";
import { enZA } from "date-fns/locale";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { isUnavailableDate } from "@/lib/shared/validation/booking";
import { Toast } from "@/components/ui";

// Load stylesheet - essential for basic structure, but we override the looks below
import "react-datepicker/dist/react-datepicker.css";

const ReactDatePicker: any = dynamic(() => import("react-datepicker"), { ssr: false });

interface PersonalizedVideoDatePickerProps {
  value: string; // ISO date (yyyy-MM-dd) or empty string
  minDateIso: string;
  unavailableDates: string[];
  onChange: (value: string) => void;
}

export function PersonalizedVideoDatePicker({
  value,
  minDateIso,
  unavailableDates,
  onChange,
}: PersonalizedVideoDatePickerProps) {
  // Memoize dates to prevent flicker
  const selectedDate = useMemo(() => 
    value ? startOfDay(new Date(`${value}T00:00:00`)) : null, 
  [value]);
  
  const minDate = useMemo(() => startOfDay(new Date(minDateIso)), [minDateIso]);
  const today = useMemo(() => startOfDay(new Date()), []);

  // Determine rush warning threshold (e.g., within 48h)
  const rushThreshold = useMemo(() => addDays(today, 2), [today]);

  return (
    <div className="w-full flex justify-center">
      <div className={`
        relative p-4 rounded-2xl border border-gray-100 bg-white shadow-sm w-full max-w-[340px]
        
        /* --- Deep CSS Overrides for React Datepicker --- */
        
        /* Remove default borders and backgrounds */
        [&_.react-datepicker]:!border-0 
        [&_.react-datepicker]:!bg-transparent 
        [&_.react-datepicker]:!font-sans
        
        /* Header styling */
        [&_.react-datepicker__header]:!bg-transparent 
        [&_.react-datepicker__header]:!border-0 
        [&_.react-datepicker__header]:pt-0
        
        /* Day names (Mo, Tu, We) */
        [&_.react-datepicker__day-name]:!text-gray-400 
        [&_.react-datepicker__day-name]:!font-medium 
        [&_.react-datepicker__day-name]:!w-10 
        [&_.react-datepicker__day-name]:text-xs 
        [&_.react-datepicker__day-name]:uppercase 
        [&_.react-datepicker__day-name]:tracking-wider

        /* Day Grid */
        [&_.react-datepicker__month]:!m-0
        [&_.react-datepicker__month]:!mt-4

        /* Individual Days */
        [&_.react-datepicker__day]:!w-10 
        [&_.react-datepicker__day]:!h-10 
        [&_.react-datepicker__day]:!leading-10 
        [&_.react-datepicker__day]:!m-0 
        [&_.react-datepicker__day]:!rounded-full 
        [&_.react-datepicker__day]:transition-all 
        [&_.react-datepicker__day]:duration-200
        
        /* Remove default blue outline on focus */
        [&_.react-datepicker__day:focus]:!outline-none
        [&_.react-datepicker__day--keyboard-selected]:!bg-transparent
        [&_.react-datepicker__day--keyboard-selected]:!text-inherit
      `}>
        <ReactDatePicker
          selected={selectedDate}
          inline
          locale={enZA}
          minDate={minDate}
          
          // Filter disabled dates from being clickable
          filterDate={(date: Date) => {
            const day = startOfDay(date);
            if (isBefore(day, minDate)) return false;
            return !isUnavailableDate({ date: day }, unavailableDates);
          }}
          
          // Custom class logic
          dayClassName={(date: Date) => {
            const day = startOfDay(date);
            const isDisabled = isBefore(day, minDate) || isUnavailableDate({ date: day }, unavailableDates);
            const isSelected = !!(selectedDate && isSameDay(day, selectedDate));
            const isToday = isSameDay(day, today);

            if (isDisabled) {
              return "!text-gray-200 line-through decoration-gray-200 cursor-not-allowed hover:bg-transparent";
            }
            
            if (isSelected) {
              return "!bg-black !text-white font-semibold shadow-md shadow-gray-300 transform scale-105";
            }

            // Normal available day
            let classes = "text-gray-700 hover:bg-gray-100 font-medium";
            
            // Visual cue for "Today" if not selected
            if (isToday && !isSelected) {
               classes += " text-emerald-600 font-bold bg-emerald-50/50";
            }

            return classes;
          }}

          // Handle Selection
          onChange={(date: Date | null) => {
            if (!date) {
              onChange("");
              return;
            }
            const day = startOfDay(date);
            
            // Double check validation (safety)
            if (isBefore(day, minDate) || isUnavailableDate({ date: day }, unavailableDates)) {
              Toast.error("This date is unavailable.");
              return;
            }

            // Visual check for rush fee (optional UX enhancement)
            if (isBefore(day, rushThreshold) && !isBefore(day, today)) {
               // You could trigger a specific toast here if you wanted, 
               // but the wizard handles the price update automatically.
            }

            const iso = format(day, "yyyy-MM-dd");
            onChange(iso);
          }}

          // Custom Header
          renderCustomHeader={({
            date,
            decreaseMonth,
            increaseMonth,
            prevMonthButtonDisabled,
            nextMonthButtonDisabled,
          }: any) => (
            <div className="flex items-center justify-between px-2 mb-4">
               {/* Previous Month */}
              <button
                onClick={(e) => { e.preventDefault(); decreaseMonth(); }}
                disabled={prevMonthButtonDisabled}
                className={`
                  p-2 rounded-full transition-colors 
                  ${prevMonthButtonDisabled ? 'text-gray-200 cursor-not-allowed' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}
                `}
              >
                <ChevronLeftIcon className="h-5 w-5 stroke-2" />
              </button>

              {/* Month Label */}
              <div className="text-sm font-bold text-gray-900">
                {format(date, "MMMM yyyy")}
              </div>

              {/* Next Month */}
              <button
                onClick={(e) => { e.preventDefault(); increaseMonth(); }}
                disabled={nextMonthButtonDisabled}
                className={`
                  p-2 rounded-full transition-colors 
                  ${nextMonthButtonDisabled ? 'text-gray-200 cursor-not-allowed' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}
                `}
              >
                <ChevronRightIcon className="h-5 w-5 stroke-2" />
              </button>
            </div>
          )}
        />
        
        {/* Optional Legend */}
        <div className="mt-4 flex items-center justify-center gap-4 text-[10px] text-gray-400 font-medium uppercase tracking-wide">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-black"></div>
            <span>Selected</span>
          </div>
          <div className="flex items-center gap-1.5">
             <div className="w-2 h-2 rounded-full bg-gray-200"></div>
             <span>Unavailable</span>
          </div>
        </div>
      </div>
    </div>
  );
}