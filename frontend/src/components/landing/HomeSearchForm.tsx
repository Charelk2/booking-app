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
    router.push(`/service-providers?${params.toString()}`);
  };

  return (
    <form onSubmit={onSearch} className="mt-8 flex justify-center">
      <div className="flex w-full max-w-2xl flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <input
          type="text"
          placeholder="Destination"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand sm:w-64"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand sm:w-56"
        />
        <Button
          type="submit"
          className="min-h-[44px] w-full sm:w-32"
          variant="primary"
        >
          Search
        </Button>
      </div>
    </form>
  );
}
