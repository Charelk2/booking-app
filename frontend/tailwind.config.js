const colors = require("tailwindcss/colors");
const defaultTheme = require("tailwindcss/defaultTheme");
const {
  BREAKPOINT_SM,
  BREAKPOINT_MD,
  BREAKPOINT_LG,
} = require("./breakpoints.config");
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    // include shared style files so Tailwind preserves classes
    "./src/styles/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    screens: {
      ...defaultTheme.screens,
      sm: `${BREAKPOINT_SM}px`,
      md: `${BREAKPOINT_MD}px`,
      lg: `${BREAKPOINT_LG}px`,
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)"],
      },
      borderRadius: {
        xxl: "1.25rem",
      },
      spacing: {
        35: "8.75rem",
      },
      colors: {
        beige: "#F5F5DC",
        brand: {
          DEFAULT: "var(--brand-color)",
          dark: "var(--brand-color-dark)",
          light: "var(--brand-color-light)",
        },
        wizard: {
          step: "var(--color-primary)",
          pending: "#e5e7eb",
          
        },
        primary: {
          DEFAULT: "var(--color-primary)",
          50: "#FFEAEA",
          600: "#FF5A5F",
          700: "#E04852",
        },
        secondary: "var(--color-secondary)",
        accent: "var(--color-accent)",
        border: "var(--color-border)",
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        orange: colors.orange,
        yellow: colors.yellow,
        dashboard: {
          primary: "var(--dashboard-primary)",
          secondary: "var(--dashboard-secondary)",
          accent: "var(--dashboard-accent)",
        },
      },
      ringOffsetWidth: {
        default: "1px",
      },
    },
  },
  plugins: [
    require("@tailwindcss/line-clamp"),
    require("@tailwindcss/container-queries"),
  ],
};
