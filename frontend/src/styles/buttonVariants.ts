export const buttonVariants = {
  primary: 'bg-brand hover:bg-brand-dark text-white focus:ring-brand-dark',
  secondary:
    'bg-white border border-gray-300 text-gray-800 hover:bg-gray-50 focus:ring-gray-300',
  outline:
    'bg-transparent border border-gray-300 text-gray-800 hover:bg-gray-50 focus:ring-gray-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  link:
    'bg-transparent underline text-brand-dark hover:text-brand-dark focus:ring-brand px-0 py-0',
} as const;

export type ButtonVariant = keyof typeof buttonVariants;

