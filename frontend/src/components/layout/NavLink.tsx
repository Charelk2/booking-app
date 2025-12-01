import Link, { LinkProps } from 'next/link';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';
import { navLinkClasses } from './navStyles';

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
      prefetch={false}
      aria-current={isActive ? 'page' : undefined}
      className={clsx(navLinkClasses(isActive), className)}
    >
      {children}
    </Link>
  );
}
