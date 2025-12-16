// tailwind.config.js
const colors = require('tailwindcss/colors');
const defaultTheme = require('tailwindcss/defaultTheme');
const {
  BREAKPOINT_SM,
  BREAKPOINT_MD,
  BREAKPOINT_LG,
} = require('./breakpoints.config');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'], // keep class-driven theming if you ever want an inverted mode
	  content: [
	    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
	    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
	    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
	    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
	    // include shared style files so Tailwind preserves classes
	    './src/styles/**/*.{js,ts,jsx,tsx}',
	  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '1rem',
        lg: '2rem',
        xl: '2.5rem',
        '2xl': '3rem',
      },
    },
    screens: {
      ...defaultTheme.screens,
      sm: `${BREAKPOINT_SM}px`,
      md: `${BREAKPOINT_MD}px`,
      lg: `${BREAKPOINT_LG}px`,
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', ...defaultTheme.fontFamily.sans],
      },
      borderRadius: {
        xxl: '1.25rem', // 20px rounded for cards/buttons
      },
      spacing: {
        35: '8.75rem',
      },
      // Monochrome-forward tokens (with CSS variable fallbacks)
      colors: {
        // Core mono system
        paper: 'var(--paper, #ffffff)',
        ink: 'var(--ink, #000000)',
        line: 'var(--line, rgba(0,0,0,0.10))',
        subtle: 'var(--subtle, rgba(0,0,0,0.04))',

        // Brand mapped to black/white
        brand: {
          DEFAULT: 'var(--brand, #000000)',
          dark: 'var(--brand-dark, #000000)',
          light: 'var(--brand-light, #ffffff)',
          foreground: 'var(--brand-foreground, #ffffff)',
        },

        // Wizard tokens (kept for compatibility with your code)
        wizard: {
          step: 'var(--color-primary, #000000)',
          pending: '#e5e7eb', // neutral-200
        },

        // Primary/secondary mapped to mono
        primary: {
          DEFAULT: 'var(--color-primary, #000000)',
          50: '#f5f5f5', // light wash for subtle backgrounds
          600: '#000000',
          700: '#000000',
        },
        secondary: 'var(--color-secondary, #ffffff)',

        // App-level tokens (kept; now default to mono)
        accent: 'var(--color-accent, #000000)',
        border: 'var(--color-border, rgba(0,0,0,0.10))',
        background: 'var(--color-background, #ffffff)',
        foreground: 'var(--color-foreground, #0a0a0a)',

        // Keep default palettes accessible if needed elsewhere
        neutral: colors.neutral,

        // Dashboard namespace (left intact; defaults can still be set via CSS vars)
        dashboard: {
          primary: 'var(--dashboard-primary, #000000)',
          secondary: 'var(--dashboard-secondary, #ffffff)',
          accent: 'var(--dashboard-accent, #000000)',
        },
      },

      // Crisp black focus rings by default
      ringColor: {
        DEFAULT: 'var(--ring, #000000)',
      },
      ringOffsetWidth: {
        default: '1px',
      },

      // Softer, product-like shadows that work on white
      boxShadow: {
        card: '0 1px 2px 0 rgba(0,0,0,0.06)',
        elevation: '0 10px 15px -3px rgba(0,0,0,0.10), 0 4px 6px -2px rgba(0,0,0,0.05)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/line-clamp'),
    require('@tailwindcss/container-queries'),
  ],
};
