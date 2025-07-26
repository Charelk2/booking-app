const colors = require('tailwindcss/colors');
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
      borderRadius: {
        xxl: '1.25rem',
      },
      colors: {
        brand: {
          DEFAULT: 'var(--brand-color)',
          dark: 'var(--brand-color-dark)',
          light: 'var(--brand-color-light)',
        },
        wizard: {
          step: '#6366f1',
          pending: '#e5e7eb',
        },
        primary: {
          DEFAULT: 'var(--color-primary)',
          50: '#EEF2FF',
          600: '#4F46E5',
          700: '#4338CA',
        },
        secondary: 'var(--color-secondary)',
        accent: 'var(--color-accent)',
        border: 'var(--color-border)',
        background: 'var(--color-background)',
        foreground: 'var(--color-foreground)',
        orange: colors.orange,
        yellow: colors.yellow,
      },
      ringOffsetWidth: {
        default: '1px',
      },
    },
  },
  plugins: [require('@tailwindcss/line-clamp')],
}
