/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#142B45', 700: '#1B3A5C', 800: '#142B45', 900: '#0E2036' },
        brand: { DEFAULT: '#2864DC', 600: '#1F55C0', 50: '#EAF0FC' },
        teal: { DEFAULT: '#16A69A', 50: '#E5F6F4' },
        canvas: '#F4F7FB',
        line: '#E4EAF1',
        ink: { DEFAULT: '#172B45', soft: '#718096' },
        ok: { DEFAULT: '#16A36A', 50: '#E4F5EC' },
        warn: { DEFAULT: '#F2B544', 50: '#FEF5E1', ink: '#8A5A00' },
        bad: { DEFAULT: '#DC5656', 50: '#FCEAEA' },
      },
      fontFamily: { sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'] },
      borderRadius: { card: '14px' },
      boxShadow: { card: '0 1px 2px rgba(20,43,69,0.04), 0 2px 8px rgba(20,43,69,0.04)' },
    },
  },
  plugins: [],
};
