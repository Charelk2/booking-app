'use client';

import React from 'react';
import Button from '../ui/Button';

interface MobileSaveBarProps {
  onSave: () => void;
  isSaving?: boolean;
}

export default function MobileSaveBar({ onSave, isSaving = false }: MobileSaveBarProps) {
  return (
    <div className="fixed bottom-14 left-0 right-0 z-40 sm:hidden bg-white border-t p-2 flex justify-end">
      <Button onClick={onSave} isLoading={isSaving} fullWidth>
        Save Changes
      </Button>
    </div>
  );
}
