import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0f',
        surface: '#111118',
        'surface-2': '#1a1a24',
        border: '#2a2a38',
        primary: '#7c6df5',
        'primary-hover': '#6b5ce7',
        accent: '#4fd1c5',
        'text-primary': '#f0f0f5',
        'text-muted': '#6b7280',
        'text-dim': '#4b5563',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
      },
      typography: {
        DEFAULT: {
          css: {
            color: '#f0f0f5',
            maxWidth: 'none',
            a: { color: '#7c6df5', textDecoration: 'underline' },
            strong: { color: '#f0f0f5', fontWeight: '600' },
            h1: { color: '#f0f0f5', marginTop: '1em', marginBottom: '0.4em' },
            h2: { color: '#f0f0f5', marginTop: '1em', marginBottom: '0.4em' },
            h3: { color: '#f0f0f5', marginTop: '0.8em', marginBottom: '0.3em' },
            p: { marginTop: '0.6em', marginBottom: '0.6em' },
            li: { marginTop: '0.2em', marginBottom: '0.2em' },
            code: { color: '#4fd1c5', backgroundColor: '#1a1a24', padding: '0.1em 0.3em', borderRadius: '0.25rem', fontWeight: '400' },
            'code::before': { content: '""' },
            'code::after': { content: '""' },
            pre: { backgroundColor: '#1a1a24', border: '1px solid #2a2a38', borderRadius: '0.75rem' },
            hr: { borderColor: '#2a2a38' },
            blockquote: { borderLeftColor: '#7c6df5', color: '#6b7280' },
          },
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
