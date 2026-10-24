/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f4f6fb',
          100: '#e8ecf6',
          600: '#25355f',
          700: '#1c2a4d',
          800: '#16213d',
          900: '#111a30',
        },
        brand: {
          50: '#eff9ff',
          100: '#dff2ff',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
        },
        tealx: {
          50: '#effcf6',
          100: '#d7f7e8',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
        },
        whatsapp: {
          500: '#22c35e',
          600: '#16a34a',
          700: '#15803d',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Noto Sans Gujarati',
          'Nirmala UI',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 3px rgba(16, 24, 40, 0.06), 0 1px 2px rgba(16, 24, 40, 0.04)',
        'card-hover': '0 6px 16px rgba(16, 24, 40, 0.10)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'scale-in': 'scale-in 0.15s ease-out',
      },
    },
  },
  plugins: [],
}
