/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f8f6ff',
          100: '#f0eaff',
          200: '#e0d5ff',
          300: '#d0c0ff',
          400: '#b8a0ff',
          500: '#a080ff',
          600: '#8860ff',
          700: '#7040ff',
          800: '#5820e0',
          900: '#4010c0',
        },
        secondary: {
          50: '#fff8f5',
          100: '#ffe8dc',
          200: '#ffd4bc',
          300: '#ffb890',
          400: '#ff9c60',
          500: '#ff8040',
          600: '#ff6820',
          700: '#e54d10',
          800: '#b83a0a',
          900: '#8b2705',
        },
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #a080ff 0%, #ff8040 100%)',
        'gradient-dark': 'linear-gradient(135deg, #5820e0 0%, #e54d10 100%)',
        'gradient-subtle': 'linear-gradient(135deg, rgba(160, 128, 255, 0.1) 0%, rgba(255, 128, 64, 0.1) 100%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
      },
    },
  },
  plugins: [],
}
