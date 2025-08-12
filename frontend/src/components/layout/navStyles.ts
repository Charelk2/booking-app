import clsx from 'clsx';

export const navItemClasses =
  'inline-flex items-center text-sm font-medium no-underline hover:no-underline min-w-[44px] min-h-[44px]';

export const navLinkClasses = (isActive?: boolean) =>
  clsx(
    navItemClasses,
    'border-b-2 transition-colors',
    isActive
      ? 'border-primary text-gray-900'
      : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300',
  );
