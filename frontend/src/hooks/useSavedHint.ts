import { useCallback, useRef, useState } from 'react';

export default function useSavedHint(delayMs = 1200) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startSaving = useCallback(() => {
    setSaved(false);
    setSaving(true);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const doneSaving = useCallback(() => {
    setSaving(false);
    setSaved(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSaved(false), delayMs);
  }, [delayMs]);

  // Stop without marking as saved (e.g., on error)
  const stopSaving = useCallback(() => {
    setSaving(false);
    setSaved(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { saving, saved, startSaving, doneSaving, stopSaving };
}
