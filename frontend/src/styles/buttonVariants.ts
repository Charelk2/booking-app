export const buttonVariants = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-700',
  secondary: 'bg-gray-100 text-black hover:bg-gray-200 focus:ring-gray-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
} as const;

export type ButtonVariant = keyof typeof buttonVariants;

