export const buttonVariants = {
  primary:
    'bg-brand text-white hover:bg-brand-dark/90 hover:shadow focus:ring-brand-dark',
  secondary:
    'bg-white border border-brand text-brand hover:bg-brand-light focus:ring-brand',
  outline:
    'bg-transparent border border-brand text-brand hover:bg-brand-light focus:ring-brand',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  link:
    'bg-transparent underline text-brand-dark hover:text-brand-dark focus:ring-brand px-0 py-0',
} as const;

export type ButtonVariant = keyof typeof buttonVariants;

