'use client';

import React from "react";
import dynamic from "next/dynamic";
import { startOfDay, isBefore, format } from "date-fns";
import { enZA } from "date-fns/locale";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { isUnavailableDate } from "@/lib/shared/validation/booking";
import { Toast } from "@/components/ui";

import "./pvDatepicker.css";

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
  const selectedDate = value ? startOfDay(new Date(`${value}T00:00:00`)) : null;
  const minDate = startOfDay(new Date(minDateIso));

  return (
    <div className="mx-auto w-fit pv-datepicker-wrapper">
      <ReactDatePicker
        selected={selectedDate}
        inline
        locale={enZA}
        minDate={minDate}
        calendarClassName="pv-datepicker"
        filterDate={(date: Date) => {
          const day = startOfDay(date);
          if (isBefore(day, minDate)) return false;
          return !isUnavailableDate({ date }, unavailableDates);
        }}
        onChange={(date: Date | null) => {
          if (!date) {
            onChange("");
            return;
          }
          const day = startOfDay(date);
          if (isBefore(day, minDate) || isUnavailableDate({ date: day }, unavailableDates)) {
            Toast.error("That delivery date is not available. Please choose another day.");
            return;
          }
          const iso = format(day, "yyyy-MM-dd");
          onChange(iso);
        }}
        renderCustomHeader={(hdrProps: any) => {
          const {
            date,
            decreaseMonth,
            increaseMonth,
            prevMonthButtonDisabled,
            nextMonthButtonDisabled,
          } = hdrProps;
          return (
            <div className="flex justify-between items-center px-3 pt-2 pb-2">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  decreaseMonth();
                }}
                disabled={prevMonthButtonDisabled}
                aria-label="Previous month"
                className="p-2.5 rounded-full hover:bg-gray-100 active:bg-gray-200"
              >
                <ChevronLeftIcon className="h-5 w-5 text-gray-500" />
              </button>
              <span className="text-base font-semibold text-gray-900">
                {date.toLocaleString("default", { month: "long", year: "numeric" })}
              </span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  increaseMonth();
                }}
                disabled={nextMonthButtonDisabled}
                aria-label="Next month"
                className="p-2.5 rounded-full hover:bg-gray-100 active:bg-gray-200"
              >
                <ChevronRightIcon className="h-5 w-5 text-gray-500" />
              </button>
            </div>
          );
        }}
      />
    </div>
  );
}

