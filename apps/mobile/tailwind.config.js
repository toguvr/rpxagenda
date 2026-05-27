/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          // identidade — preto + ciano do logo
          black: '#000000',
          ink: '#0B1F24', // texto principal (preto levemente esverdeado)
          cyan: '#00BCD4', // acento primário
          cyanDark: '#0097A7', // acento pressionado / texto sobre claro
          cyanDeep: '#005662', // ciano profundo p/ títulos sobre claro
          cyanLight: '#B2EBF2',
          cyanSoft: '#E4F7FA', // tinta pálida p/ estados selecionados
          bgDark: '#071A1E', // fundo escuro (login/splash)
          canvas: '#F1F4F5', // fundo claro do app
          surface: '#FFFFFF',
        },
      },
      borderRadius: {
        '4xl': '28px',
      },
    },
  },
  plugins: [],
};
