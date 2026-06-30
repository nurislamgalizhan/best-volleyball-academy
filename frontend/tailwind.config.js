/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#334155',
          700: '#1e293b',
          800: '#111827',
          900: '#020617',
        },
      },
      animation: {
        'flash-green': 'flashGreen 1.6s ease-out forwards',
      },
      keyframes: {
        flashGreen: {
          '0%': { backgroundColor: '#86efac' },
          '45%': { backgroundColor: '#dcfce7' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
    },
  },
  plugins: [],
};
