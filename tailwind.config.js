/** @type {import('tailwindcss').Config} */
export default {
  // ThemeContext toggles the `dark` class on <html>.
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        arabic: ['"IBM Plex Sans Arabic"', '"IBM Plex Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        'brand-primary': '#007B8A',
        'brand-secondary': '#5BC0BE',
        'brand-accent': '#EBF4F5',
        'brand-light': '#F9FAFB',
        'brand-dark': '#2D3748',
        'brand-success': '#48BB78',
        'brand-danger': '#F56565',

        /*
          Redesign palette. Warm paper rather than clinical grey, one deep
          teal, one saffron for caution, one clay red for danger, and no
          gradients. Values read out of Redesign.dc.html, not approximated.

          The brand-* names above stay until the last screen has moved over,
          so the app keeps working while it is migrated a screen at a time.
        */
        ink: {
          DEFAULT: '#0B2B2E',
          mid: '#3D4F50',
          dim: '#2C3E3F',
          soft: '#5B6A6A',
        },
        paper: {
          DEFAULT: '#F7F3EC',
          deep: '#F0E9DC',
          sand: '#E2D9C9',
          edge: '#CFC5B2',
        },
        teal: {
          DEFAULT: '#0A5A56',
          light: '#7FBDB4',
          wash: '#E4F1ED',
          mist: '#EDF3F1',
        },
        clay: {
          DEFAULT: '#B23A2B',
          deep: '#8C2F23',
          soft: '#E7BDB4',
          wash: '#FBEDE9',
          light: '#F09080',
        },
        saffron: {
          DEFAULT: '#7A4E0B',
          mid: '#9A6414',
          soft: '#F0C070',
          wash: '#FDF1DC',
          light: '#F5DCB0',
        },
        night: {
          DEFAULT: '#06231F',
          surface: '#0F2E2D',
          sunk: '#08201F',
          lens: '#123B3F',
          ink: '#EDF3F1',
          soft: '#9FB5B2',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'fade-in-fast': 'fadeIn 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.35s cubic-bezier(0.34,1.1,0.64,1)',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        // Bottom-sheet entrance for the patient details dialog on phones.
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
