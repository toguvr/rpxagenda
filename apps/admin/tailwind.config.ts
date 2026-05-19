import type { Config } from 'tailwindcss';
import { brandColors } from '@rpx/shared';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          black: brandColors.black,
          cyan: brandColors.cyan,
          cyanDark: brandColors.cyanDark,
          cyanLight: brandColors.cyanLight,
          bgLight: brandColors.bgLight,
          bgDark: brandColors.bgDark,
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
