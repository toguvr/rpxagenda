/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          black: '#000000',
          cyan: '#00BCD4',
          cyanDark: '#0097A7',
          cyanLight: '#B2EBF2',
          bgDark: '#0A0A0A',
        },
      },
    },
  },
  plugins: [],
};
