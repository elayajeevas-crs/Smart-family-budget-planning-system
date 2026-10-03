import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Button builds `btn-${variant}` dynamically, so keep these component classes.
  safelist: ['btn-primary', 'btn-secondary', 'btn-danger', 'btn-ghost', 'btn-sm', 'input-error'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', ...defaultTheme.fontFamily.sans] },
    },
  },
  plugins: [],
};
