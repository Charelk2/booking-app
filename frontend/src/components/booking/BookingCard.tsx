import React from 'react';

export interface BookingCardAction {
  label: string;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
  ariaLabel: string;
  dataTestId?: string;
}

export interface BookingCardProps {
  title: string;
  date: string;
  status: string;
  price: string;
  actions: BookingCardAction[];
  children?: React.ReactNode;
}

export default function BookingCard({
  title,
  date,
  status,
  price,
  actions,
  children,
}: BookingCardProps) {
  const statusClass =
    status === 'Completed'
      ? 'bg-green-100 text-green-800'
      : status === 'Cancelled'
        ? 'bg-red-100 text-red-800'
        : status === 'Confirmed'
          ? 'bg-brand-light text-brand-dark'
          : 'bg-yellow-100 text-yellow-800';
  return (
    <div className="bg-white rounded-2xl shadow p-6 mb-6">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-medium text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-1">{date}</p>
        </div>
        <p className="font-semibold text-gray-900">{price}</p>
      </div>
      <div className="mt-2 flex items-center space-x-2">
        <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${statusClass}`}>
          {status}
        </span>
        {/* deposit flow removed: always full payment */}
      </div>
      {children}
      <div className="mt-4 flex flex-wrap items-center space-x-2">
        {actions.map((a) => (
          <a
            key={a.label}
            href={a.href ?? '#'}
            onClick={a.onClick}
            aria-label={a.ariaLabel}
            data-testid={a.dataTestId}
            className={`inline-flex items-center px-3 py-1.5 mx-1 rounded-full text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 ${a.primary ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            {a.label}
          </a>
        ))}
      </div>
    </div>
  );
}
