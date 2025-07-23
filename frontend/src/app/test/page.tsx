// src/app/test/page.tsx

'use client';

import { useState } from 'react';
import LocationInput from '@/components/ui/LocationInput'; // Adjust path if necessary

export default function TestPage() {
  const [location, setLocation] = useState('');

  return (
    <div className="bg-gray-200 min-h-screen p-10">
      <h1 className="text-2xl font-bold mb-4">Location Input Test</h1>
      <p className="mb-2">
        Current Value: <span className="font-mono">{location || 'none'}</span>
      </p>

      <div className="max-w-md">
        <LocationInput
          value={location}
          onChange={setLocation}
          placeholder="Try searching here..."
        />
      </div>
    </div>
  );
}