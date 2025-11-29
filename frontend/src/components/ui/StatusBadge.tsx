import clsx from 'clsx';
import { statusChipStyles } from './status';

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: 'Pending' | 'Accepted' | 'Rejected' | 'Expired' | string;
}

export default function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  const chipStyles = statusChipStyles(status);
  return (
    <span
      {...props}
      className={clsx(
        'inline-flex items-center font-medium',
        className,
      )}
      style={chipStyles}
    >
      {status}
    </span>
  );
}
