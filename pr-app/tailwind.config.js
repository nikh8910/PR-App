/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand colours — maps to existing CSS variables
        'brand-blue':       '#002957',
        'brand-light-blue': '#0ea5e9',
        'neon-lime':        '#84cc16',
      },
      borderRadius: {
        // Match the existing --radius-* tokens
        'curved': '2rem',
        'sm':  '4px',
        'md':  '8px',
        'lg':  '16px',
        'xl':  '24px',
      },
      boxShadow: {
        // Match existing --shadow-* tokens
        'sm': '0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1)',
        'md': '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
        'lg': '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
