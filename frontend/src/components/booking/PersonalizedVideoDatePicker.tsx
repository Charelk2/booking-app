'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
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

  const [isExpanded, setIsExpanded] = useState(false);

  // 2. Calendar Navigation State (Expanded month view)
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(selectedDate || minDate));

  // 3. Logic: Rush Fee Detection (e.g., within 48 hours)
  const rushThreshold = useMemo(() => addDays(today, 2), [today]);

  const stripStart = minDate;
  const stripEnd = useMemo(() => addDays(stripStart, 365), [stripStart]);
  const stripDays = useMemo(
    () => eachDayOfInterval({ start: stripStart, end: stripEnd }),
    [stripStart, stripEnd],
  );
  const [headerDate, setHeaderDate] = useState<Date>(() => selectedDate || minDate);
  const stripScrollRef = useRef<HTMLDivElement | null>(null);
  const stripInnerRef = useRef<HTMLDivElement | null>(null);
  const stripStepPxRef = useRef<number>(0);
  const scrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (selectedDate) setHeaderDate(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    const inner = stripInnerRef.current;
    if (!inner) return;
    const items = inner.querySelectorAll<HTMLElement>('[data-strip-item="1"]');
    const first = items.item(0);
    const second = items.item(1);
    if (first && second) {
      stripStepPxRef.current = second.offsetLeft - first.offsetLeft;
      return;
    }
    if (first) stripStepPxRef.current = first.offsetWidth;
  }, [stripDays]);

  const updateHeaderFromScroll = useCallback(() => {
    const el = stripScrollRef.current;
    const step = stripStepPxRef.current;
    if (!el || !step || stripDays.length === 0) return;

    const center = el.scrollLeft + el.clientWidth / 2;
    const rawIndex = Math.round(center / step);
    const index = Math.max(0, Math.min(stripDays.length - 1, rawIndex));
    const next = stripDays[index];
    setHeaderDate((prev) => (isSameDay(prev, next) ? prev : next));
  }, [stripDays]);

  const onStripScroll = useCallback(() => {
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      updateHeaderFromScroll();
    });
  }, [updateHeaderFromScroll]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  // 4. Generate Calendar Grid (Expanded)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [currentMonth]);

  // 5. Navigation Handlers (Expanded)
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  // Disable "Prev" if the current month is before the minDate's month
  const isPrevDisabled = isBefore(currentMonth, startOfMonth(minDate));

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      if (next) setCurrentMonth(startOfMonth(selectedDate || minDate));
      return next;
    });
  }, [minDate, selectedDate]);

  // 6. Date Selection Handler
  const handleDateClick = useCallback((day: Date, closeOnSelect = false) => {
    // Validation
    if (isBefore(day, minDate)) return; // Past/Too soon
    if (isUnavailableDate({ date: day }, unavailableDates)) {
      Toast.error("This date is unavailable.");
      return;
    }

    // Success
    onChange(format(day, "yyyy-MM-dd"));
    setCurrentMonth(startOfMonth(day));
    if (closeOnSelect) setIsExpanded(false);
    
    // Optional: Visual Feedback for Rush
    if (isBefore(day, rushThreshold) && !isBefore(day, today)) {
       // logic is handled by parent, but we could toast here if desired
    }
  }, [minDate, unavailableDates, onChange, rushThreshold, today]);

  useEffect(() => {
    if (!value) return;
    const container = stripScrollRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(`[data-date="${value}"]`);
    if (!target) return;
    try {
      target.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    } catch {
      // ignore
    }
  }, [value]);

  const weekDayLabels = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div className="w-full select-none">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-base font-semibold text-gray-900">
          {format(headerDate, "MMMM yyyy")}
        </div>
        <button
          type="button"
          onClick={toggleExpanded}
          aria-label={isExpanded ? "Close calendar" : "Open calendar"}
          aria-expanded={isExpanded}
          aria-controls="pv-calendar-expanded"
          className="h-9 w-9 shrink-0 rounded-full border-2 border-transparent bg-transparent flex items-center justify-center hover:border-gray-900 hover:bg-gray-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/15"
        >
          <CalendarDaysIcon className="h-5 w-5 text-gray-900" />
        </button>
      </div>

      <div className="mt-2">
        <div
          ref={stripScrollRef}
          onScroll={onStripScroll}
          className="overflow-x-auto scrollbar-hide snap-x snap-mandatory"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div
            ref={stripInnerRef}
            className="flex gap-3"
          >
            {stripDays.map((day) => {
              const iso = format(day, "yyyy-MM-dd");
              const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
              const isDisabled = isBefore(day, minDate) || isUnavailableDate({ date: day }, unavailableDates);

              const base =
                "mt-1.5 h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold transition";
              let className = base;
              if (isDisabled) {
                className += " text-gray-300 line-through decoration-gray-200 cursor-not-allowed";
              } else if (isSelected) {
                className += " bg-gray-900 text-white";
              } else {
                className += " text-gray-900 hover:bg-gray-100 active:scale-[0.98]";
              }

              return (
                <div
                  key={iso}
                  data-strip-item="1"
                  data-date={iso}
                  className="snap-center shrink-0 w-12 flex flex-col items-center pb-1"
                >
                  <div className="text-[10px] font-semibold text-gray-400 tracking-[0.18em]">
                    {format(day, "EEEEE")}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleDateClick(day);
                    }}
                    disabled={isDisabled}
                    className={className}
                  >
                    {format(day, "d")}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 h-px w-full bg-gray-200" />

      {/* Expanded month picker */}
      {isExpanded ? (
        <div id="pv-calendar-expanded" className="mt-4">
          <div className="flex items-center justify-between mb-3 px-1">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                prevMonth();
              }}
              disabled={isPrevDisabled}
              className={[
                "p-2 rounded-full transition-all duration-200",
                isPrevDisabled
                  ? "text-gray-200 cursor-not-allowed"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 active:scale-95",
              ].join(" ")}
            >
              <ChevronLeftIcon className="h-5 w-5 stroke-2" />
            </button>

            <span className="text-sm font-semibold text-gray-900">
              {format(currentMonth, "MMMM yyyy")}
            </span>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                nextMonth();
              }}
              className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-all duration-200 active:scale-95"
            >
              <ChevronRightIcon className="h-5 w-5 stroke-2" />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {weekDayLabels.map((label, idx) => (
              <div
                key={`${label}-${idx}`}
                className="h-7 flex items-center justify-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
              const isToday = isSameDay(day, today);
              const inMonth = isSameMonth(day, currentMonth);
              const isDisabled =
                isBefore(day, minDate) || isUnavailableDate({ date: day }, unavailableDates);

              let buttonClass =
                "relative h-9 w-full flex items-center justify-center rounded-full text-sm transition-all duration-200 ";

              if (isDisabled) {
                buttonClass += "text-gray-200 line-through decoration-gray-200 cursor-not-allowed";
              } else if (isSelected) {
                buttonClass += "bg-black text-white font-semibold shadow-sm";
              } else {
                buttonClass +=
                  "text-gray-700 hover:bg-gray-100 font-medium cursor-pointer active:scale-95 ";
                if (isToday) buttonClass += "text-emerald-600 font-bold bg-emerald-50/50 ";
                if (!inMonth) buttonClass += "opacity-30 ";
              }

              return (
                <div key={format(day, "yyyy-MM-dd")} className="relative px-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleDateClick(day, true);
                    }}
                    disabled={isDisabled}
                    className={buttonClass}
                  >
                    {format(day, "d")}
                    {isSelected ? (
                      <span className="absolute inset-0 rounded-full ring-2 ring-black ring-offset-2 ring-offset-white animate-pulse-once" />
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
