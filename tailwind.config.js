/** @type {import('tailwindcss').Config} */
export default {
  // ThemeContext toggles the `dark` class on <html>.
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        arabic: ['Cairo', 'sans-serif'],
      },
      colors: {
        'brand-primary': '#007B8A',
        'brand-secondary': '#5BC0BE',
        'brand-accent': '#EBF4F5',
        'brand-light': '#F9FAFB',
        'brand-dark': '#2D3748',
        'brand-success': '#48BB78',
        'brand-danger': '#F56565',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'fade-in-fast': 'fadeIn 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.35s cubic-bezier(0.34,1.1,0.64,1)',
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
      },
    },
  },
  plugins: [],
};
