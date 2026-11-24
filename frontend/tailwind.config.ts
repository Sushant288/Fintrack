import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--color-paper)',
        panel: 'var(--color-panel)',
        ink: 'var(--color-ink)',
        muted: 'var(--color-muted)',
        hairline: 'var(--color-hairline)',
        primary: {
          DEFAULT: 'var(--color-primary)',
          contrast: 'var(--color-primary-contrast)'
        },
        marigold: 'var(--color-marigold)',
        income: 'var(--color-income)',
        expense: 'var(--color-expense)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)'
      },
      fontFamily: {
        heading: ['"Bricolage Grotesque Variable"', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'sans-serif']
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '6px',
        md: '8px',
        lg: '14px',
        full: '9999px'
      },
      maxWidth: {
        content: '72rem',
        form: '28rem'
      }
    }
  },
  plugins: []
} satisfies Config;
