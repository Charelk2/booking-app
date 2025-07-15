'use client';
import Link, { LinkProps } from 'next/link';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

interface NavLinkProps
  extends LinkProps,
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  isActive?: boolean;
  children: ReactNode;
}

export default function NavLink({
  isActive,
  className,
  children,
  ...props
}: NavLinkProps) {
  return (
    <Link
      {...props}
      className={clsx(
        'inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium transition-colors',
        isActive
          ? 'border-primary text-gray-900'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
        className,
      )}
    >
      {children}
    </Link>
  );
}
