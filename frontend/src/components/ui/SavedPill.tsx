"use client";

import React from 'react';

export default function SavedPill({ saving, saved }: { saving?: boolean; saved?: boolean }) {
  if (saving) return <span className="text-xs text-gray-500">Saving…</span>;
  if (saved) return <span className="text-xs text-emerald-600">Saved</span>;
  return null;
}

