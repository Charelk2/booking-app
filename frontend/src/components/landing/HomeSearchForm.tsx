'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';

export default function HomeSearchForm() {
  const router = useRouter();
  const [destination, setDestination] = useState('');
  const [date, setDate] = useState('');

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (destination) params.set('location', destination);
    if (date) params.set('date', date);
    router.push(`/artists?${params.toString()}`);
  };

  return (
    <form
      onSubmit={onSearch}
      className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
    >
      <input
        type="text"
        placeholder="Destination"
        value={destination}
        onChange={(e) => setDestination(e.target.value)}
        className="min-h-[44px] w-64 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand"
      />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="min-h-[44px] w-56 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand"
      />
      <Button
        type="submit"
        className="min-h-[44px] w-32"
        variant="primary"
      >
        Search
      </Button>
    </form>
  );
}
