export const buttonVariants = {
  primary: 'bg-brand text-white hover:bg-brand-dark focus:ring-brand-dark',
  secondary:
    'bg-brand-light text-brand-dark hover:bg-brand focus:ring-brand-dark',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
} as const;

export type ButtonVariant = keyof typeof buttonVariants;

