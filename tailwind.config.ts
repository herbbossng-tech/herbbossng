import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0f3d2e',
          dark: '#0a2e22',
          light: '#155a41',
        },
        gold: {
          DEFAULT: '#b6862c',
          light: '#d9a94a',
        },
        cream: '#faf7f0',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      boxShadow: {
        card: '0 2px 10px rgba(15, 61, 46, 0.08)',
        cardSelected: '0 4px 18px rgba(15, 61, 46, 0.18)',
      },
    },
  },
  plugins: [],
};

export default config;
