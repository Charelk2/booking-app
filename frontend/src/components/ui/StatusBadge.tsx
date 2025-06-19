import clsx from 'clsx';

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: 'Pending' | 'Accepted' | 'Rejected' | string;
}

export default function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  const color = {
    Pending: 'bg-yellow-100 text-yellow-800',
    Accepted: 'bg-green-100 text-green-800',
    Rejected: 'bg-red-100 text-red-800',
  }[status] || 'bg-gray-100 text-gray-800';
  return (
    <span
      {...props}
      className={clsx(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        color,
        className,
      )}
    >
      {status}
    </span>
  );
}
