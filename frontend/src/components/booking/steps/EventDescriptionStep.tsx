'use client';
import {
  Control,
  Controller,
  UseFormSetValue,
  UseFormWatch,
} from 'react-hook-form';
import { useRef, useState } from 'react';
import useIsMobile from '@/hooks/useIsMobile';
import { EventDetails } from '@/contexts/BookingContext';
import { CollapsibleSection } from '../../ui';
import toast from '../../ui/Toast';
import { parseBookingText } from '@/lib/api';
import type { ParsedBookingDetails } from '@/types';

interface WebSpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface WebSpeechRecognition extends EventTarget {
  start(): void;
  stop(): void;
  onresult: (event: WebSpeechRecognitionEvent) => void;
  onend: () => void;
}

interface SpeechRecognitionConstructor {
  new (): WebSpeechRecognition;
}

interface Props {
  control: Control<EventDetails>;
  setValue: UseFormSetValue<EventDetails>;
  watch: UseFormWatch<EventDetails>;
  open?: boolean;
  onToggle?: () => void;
}

export default function EventDescriptionStep({
  control,
  setValue,
  watch,
  open = true,
  onToggle = () => {},
}: Props) {
  const isMobile = useIsMobile();
  type ParsedDetails = Omit<ParsedBookingDetails, 'event_type'> & { eventType?: string };
  const [parsed, setParsed] = useState<ParsedDetails | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<WebSpeechRecognition | null>(null);

  const startListening = () => {
    const win = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SR) {
      toast.error('Voice input not supported');
      return;
    }
    const rec: WebSpeechRecognition = new SR();
    recognitionRef.current = rec;
    rec.onresult = (e: WebSpeechRecognitionEvent) => {
      const txt = e.results[0][0].transcript;
      const current = watch('eventDescription') || '';
      setValue('eventDescription', `${current} ${txt}`.trim());
    };
    rec.onend = () => setListening(false);
    rec.start();
    setListening(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
  };

  const handleParse = async (text: string) => {
    if (!text.trim()) return;
    try {
      const res = await parseBookingText(text);
      const { event_type, ...rest } = res.data;
      setParsed({ ...rest, eventType: event_type });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const applyParsed = () => {
    if (parsed?.date) setValue('date', new Date(parsed.date));
    if (parsed?.location) setValue('location', parsed.location);
    if (parsed?.guests !== undefined) setValue('guests', String(parsed.guests));
    if (parsed?.eventType) setValue('eventType', parsed.eventType);
    setParsed(null);
  };

  return (
    <CollapsibleSection
      title="Event Details"
      description="Tell us a little bit more about your event."
      open={open}
      onToggle={onToggle}
      className="wizard-step-container rounded-2xl border border-black/10 bg-white p-6 shadow-sm"
    >
      <Controller<EventDetails, 'eventDescription'>
        name="eventDescription"
        control={control}
        render={({ field }) => (
          <div className="space-y-2">
            <label htmlFor="event-description" className="block text-sm font-medium text-neutral-900">
              Describe your event
            </label>
            <textarea
              id="event-description"
              rows={3}
              className="input-base rounded-xl bg-white border border-black/20 placeholder:text-neutral-400 focus:border-black focus:ring-2 focus:ring-black"
              {...field}
              value={field.value || ''}
              autoFocus={!isMobile}
              placeholder="Add date, venue, city, number of guests, vibe, special notes…"
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleParse(field.value || '')}
                className="inline-flex items-center justify-center rounded-xl bg-black text-white px-3 py-2 text-sm hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
              >
                Fill with AI
              </button>
              <button
                type="button"
                onClick={listening ? stopListening : startListening}
                className="inline-flex items-center justify-center rounded-xl bg-white text-black px-3 py-2 text-sm border border-black/20 hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
              >
                {listening ? 'Stop' : '🎤 Voice'}
              </button>
            </div>
          </div>
        )}
      />

      {parsed && (
        <div className="mt-4 mb-2 rounded-2xl border border-black/10 bg-black/[0.04] p-4">
          <p className="mb-2 font-medium text-neutral-900">AI Suggestions</p>
          <ul className="mb-3 text-sm text-neutral-800 space-y-1">
            {parsed.eventType && <li><span className="text-neutral-600">Event Type:</span> {parsed.eventType}</li>}
            {parsed.date && <li><span className="text-neutral-600">Date:</span> {parsed.date}</li>}
            {parsed.location && <li><span className="text-neutral-600">Location:</span> {parsed.location}</li>}
            {parsed.guests !== undefined && <li><span className="text-neutral-600">Guests:</span> {parsed.guests}</li>}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={applyParsed}
              className="inline-flex items-center justify-center rounded-xl bg-black text-white px-3 py-2 text-sm hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => setParsed(null)}
              className="inline-flex items-center justify-center rounded-xl bg-white text-black px-3 py-2 text-sm border border-black/20 hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </CollapsibleSection>
  );
}
