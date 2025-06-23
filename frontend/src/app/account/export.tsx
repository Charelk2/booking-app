'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { exportMyAccount } from '@/lib/api';

export default function ExportAccountPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    exportMyAccount()
      .then((res) => setData(res.data))
      .catch((err) => {
        console.error('Export error:', err);
      });
  }, []);

  return (
    <MainLayout>
      <div className="mx-auto max-w-xl py-10 space-y-4">
        <h1 className="text-2xl font-bold">Export Account Data</h1>
        {data ? (
          <pre data-testid="export-json" className="whitespace-pre-wrap break-all">
            {JSON.stringify(data, null, 2)}
          </pre>
        ) : (
          <p>Loading...</p>
        )}
      </div>
    </MainLayout>
  );
}
