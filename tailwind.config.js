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
        /*
          Pointed at the tokens in index.css rather than at literals, so every
          one of these classes follows the theme. The values themselves, light
          and dark, live in one place there.
        */
        ink: {
          DEFAULT: 'var(--ink)',
          mid: 'var(--ink-mid)',
          soft: 'var(--ink-soft)',
          dim: 'var(--ink-dim)',
        },
        paper: {
          DEFAULT: 'var(--paper)',
          deep: 'var(--paper-deep)',
          sand: 'var(--paper-sand)',
          edge: 'var(--paper-edge)',
        },
        /* Cards and anything raised off the ground. Was a literal white. */
        surface: {
          DEFAULT: 'var(--surface)',
          danger: 'var(--surface-danger)',
        },
        teal: {
          DEFAULT: 'var(--teal)',
          light: 'var(--teal-light)',
          wash: 'var(--teal-wash)',
          mist: 'var(--teal-mist)',
          on: 'var(--on-teal)',
        },
        clay: {
          DEFAULT: 'var(--clay)',
          deep: 'var(--clay-deep)',
          soft: 'var(--clay-soft)',
          wash: 'var(--clay-wash)',
          light: 'var(--clay-light)',
        },
        saffron: {
          DEFAULT: 'var(--saffron)',
          mid: 'var(--saffron-mid)',
          soft: 'var(--saffron-soft)',
          wash: 'var(--saffron-wash)',
          light: 'var(--saffron-light)',
          body: 'var(--saffron-body)',
        },
        night: {
          DEFAULT: 'var(--night)',
          surface: 'var(--night-surface)',
          sunk: 'var(--night-sunk)',
          lens: 'var(--night-lens)',
          ink: 'var(--night-ink)',
          soft: 'var(--night-soft)',
        },
        /* Deliberately inverted against the ground. */
        selected: {
          DEFAULT: 'var(--selected-bg)',
          fg: 'var(--selected-fg)',
        },
        invert: {
          DEFAULT: 'var(--invert-surface)',
          ink: 'var(--invert-ink)',
          soft: 'var(--invert-soft)',
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
