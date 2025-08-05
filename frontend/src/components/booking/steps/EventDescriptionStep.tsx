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
  const [parsed, setParsed] = useState<Partial<EventDetails> | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error('Voice input not supported');
      return;
    }
    const rec: SpeechRecognition = new SR();
    recognitionRef.current = rec;
    rec.onresult = (e: SpeechRecognitionEvent) => {
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
      className="wizard-step-container"
    >
      <Controller<EventDetails, 'eventDescription'>
        name="eventDescription"
        control={control}
        render={({ field }) => (
          <div>
            <label htmlFor="event-description" className="block font-medium">
              
            </label>
            <textarea
              id="event-description"
              rows={3}
              className="input-base"
              {...field}
              value={field.value || ''}
              autoFocus={!isMobile}
            />
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => handleParse(field.value || '')}
                className="bg-blue-600 text-white px-3 py-1 rounded"
              >
                Fill with AI
              </button>
              <button
                type="button"
                onClick={listening ? stopListening : startListening}
                className="bg-gray-200 px-3 py-1 rounded"
              >
                {listening ? 'Stop' : '🎤'}
              </button>
            </div>
          </div>
        )}
      />
      {parsed && (
        <div className="mt-4 mb-4 border p-2 rounded bg-gray-50">
          <p className="mb-2">AI Suggestions:</p>
          <ul className="mb-2 text-sm">
            {parsed.eventType && <li>Event Type: {parsed.eventType}</li>}
            {parsed.date && <li>Date: {parsed.date}</li>}
            {parsed.location && <li>Location: {parsed.location}</li>}
            {parsed.guests !== undefined && <li>Guests: {parsed.guests}</li>}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={applyParsed}
              className="bg-green-600 text-white px-2 py-1 rounded"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => setParsed(null)}
              className="bg-gray-200 px-2 py-1 rounded"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </CollapsibleSection>
  );
}

