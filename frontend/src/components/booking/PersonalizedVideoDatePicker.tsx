'use client';

import React, { useState, useMemo, useCallback } from "react";
import { 
  startOfDay, 
  isBefore, 
  format, 
  isSameDay, 
  addDays, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  addMonths, 
  subMonths 
} from "date-fns";
import { enZA } from "date-fns/locale"; // Or your preferred locale
import { ChevronLeftIcon, ChevronRightIcon, BoltIcon } from "@heroicons/react/24/outline";
import { isUnavailableDate } from "@/lib/shared/validation/booking";
import { Toast } from "@/components/ui";

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
  // 1. Parse Input Data
  const selectedDate = useMemo(() => value ? startOfDay(new Date(`${value}T00:00:00`)) : null, [value]);
  const minDate = useMemo(() => startOfDay(new Date(minDateIso)), [minDateIso]);
  const today = useMemo(() => startOfDay(new Date()), []);
  
  // 2. Calendar Navigation State (Visual Month)
  // Initialize to selected date or minDate if no selection
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(selectedDate || minDate));

  // 3. Logic: Rush Fee Detection (e.g., within 48 hours)
  const rushThreshold = useMemo(() => addDays(today, 2), [today]);

  // 4. Generate Calendar Grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart); // defaults to Sunday start
    const endDate = endOfWeek(monthEnd);
    
    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [currentMonth]);

  // 5. Navigation Handlers
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  
  // Disable "Prev" if the current month is before the minDate's month
  const isPrevDisabled = isBefore(currentMonth, startOfMonth(minDate));

  // 6. Date Selection Handler
  const handleDateClick = useCallback((day: Date) => {
    // Validation
    if (isBefore(day, minDate)) return; // Past/Too soon
    if (isUnavailableDate({ date: day }, unavailableDates)) {
      Toast.error("This date is unavailable.");
      return;
    }

    // Success
    onChange(format(day, "yyyy-MM-dd"));
    
    // Optional: Visual Feedback for Rush
    if (isBefore(day, rushThreshold) && !isBefore(day, today)) {
       // logic is handled by parent, but we could toast here if desired
    }
  }, [minDate, unavailableDates, onChange, rushThreshold, today]);

  const weekDayLabels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  return (
    <div className="w-full flex justify-center">
      <div className="w-full max-w-[340px] rounded-2xl border border-gray-100 bg-white p-4 shadow-sm select-none">
        
        {/* --- Header --- */}
        <div className="flex items-center justify-between mb-4 px-1">
          <button
            onClick={(e) => { e.preventDefault(); prevMonth(); }}
            disabled={isPrevDisabled}
            className={`
              p-2 rounded-full transition-all duration-200
              ${isPrevDisabled 
                ? 'text-gray-200 cursor-not-allowed' 
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 active:scale-95'}
            `}
          >
            <ChevronLeftIcon className="h-5 w-5 stroke-2" />
          </button>

          <span className="text-sm font-bold text-gray-900 capitalize">
            {format(currentMonth, "MMMM yyyy")}
          </span>

          <button
            onClick={(e) => { e.preventDefault(); nextMonth(); }}
            className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-all duration-200 active:scale-95"
          >
            <ChevronRightIcon className="h-5 w-5 stroke-2" />
          </button>
        </div>

        {/* --- Weekday Labels --- */}
        <div className="grid grid-cols-7 mb-2">
          {weekDayLabels.map((day) => (
            <div key={day} className="h-8 flex items-center justify-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>

        {/* --- Days Grid --- */}
        <div className="grid grid-cols-7 gap-y-1">
          {calendarDays.map((day, idx) => {
            // Determine Day State
            const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
            const isToday = isSameDay(day, today);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isDisabled = isBefore(day, minDate) || isUnavailableDate({ date: day }, unavailableDates);
            const isRush = !isDisabled && isBefore(day, rushThreshold);

            // Calculation Classes
            let buttonClass = "relative h-10 w-10 mx-auto flex items-center justify-center rounded-full text-sm transition-all duration-200 ";
            
            if (isDisabled) {
               buttonClass += "text-gray-200 line-through decoration-gray-200 cursor-not-allowed";
            } else if (isSelected) {
               buttonClass += "bg-black text-white font-semibold shadow-md shadow-gray-300 scale-105";
            } else {
               buttonClass += "text-gray-700 hover:bg-gray-100 font-medium cursor-pointer active:scale-95 ";
               if (isToday) buttonClass += "text-emerald-600 font-bold bg-emerald-50/50 ";
               if (!isCurrentMonth) buttonClass += "opacity-30 "; // Fade out days from prev/next month
            }

            return (
              <div key={day.toString()} className="relative">
                <button
                  onClick={(e) => { e.preventDefault(); handleDateClick(day); }}
                  disabled={isDisabled}
                  className={buttonClass}
                >
                  {format(day, "d")}
                  
                  {/* Rush Fee Indicator Dot (Amber) */}
                  {isRush && !isSelected && !isDisabled && (
                    <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-400" />
                  )}
                  
                  {/* Selected Indicator Check (Optional aesthetic touch) */}
                  {isSelected && (
                    <span className="absolute inset-0 rounded-full ring-2 ring-black ring-offset-2 ring-offset-white animate-pulse-once" />
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* --- Legend --- */}
        <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-center gap-5 text-[10px] text-gray-400 font-medium uppercase tracking-wide">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-black"></div>
            <span>Selected</span>
          </div>
          <div className="flex items-center gap-1.5">
             <div className="w-2 h-2 rounded-full bg-amber-400"></div>
             <span>Rush Fee</span>
          </div>
          <div className="flex items-center gap-1.5">
             <div className="w-2 h-2 rounded-full bg-gray-200"></div>
             
          </div>
        </div>

      </div>
    </div>
  );
} 