'use client';

import Link from 'next/link';
import clsx from 'clsx';

interface HelpPromptProps {
  className?: string;
}

export default function HelpPrompt({ className }: HelpPromptProps) {
  return (
    <div
      className={clsx(
        'mt-4 rounded-lg bg-brand-light p-4 text-sm text-brand-dark flex flex-col sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
      data-testid="help-prompt"
    >
      <span className="font-medium">Need help?</span>
      <span className="mt-2 flex gap-4 sm:mt-0">
        <Link href="/faq" className="text-brand-dark hover:underline">
          FAQ
        </Link>
        <Link href="/contact" className="text-brand-dark hover:underline">
          Contact support
        </Link>
      </span>
    </div>
  );
}
