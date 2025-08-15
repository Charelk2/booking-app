import clsx from 'clsx';

export const navItemClasses =
  'inline-flex items-center text-sm text-black font-medium no-underline hover:no-underline min-w-[44px] min-h-[44px]';

export const navLinkClasses = (isActive?: boolean) =>
  clsx(
    navItemClasses,
    'border-b-2 transition-colors',
    isActive
      ? 'text-white-900'
      : 'border-transparent',
  );
