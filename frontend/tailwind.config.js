/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    // include shared style files so Tailwind preserves classes
    './src/styles/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
      colors: {
        brand: {
          DEFAULT: '#7c3aed',
          dark: '#6d28d9',
          light: '#c084fc',
          indigo: '#6366f1',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/line-clamp')],
}
