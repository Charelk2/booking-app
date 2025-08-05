import clsx from 'clsx';

export const navItemClasses = 'inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-sm font-medium no-underline hover:no-underline';

export const navLinkClasses = (isActive?: boolean) =>
  clsx(
    navItemClasses,
    'border-b-2 transition-colors',
    isActive
      ? 'border-primary text-gray-900'
      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
  );
