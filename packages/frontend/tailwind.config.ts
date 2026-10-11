import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Palette shared with the main SOLUT·IA LAB site (web/frontend/tailwind.config.js).
      colors: {
        background: '#f2f8fb',
        surface: '#ffffff',
        'surface-2': '#e8f2f7',
        border: '#cfe0e7',
        primary: '#00a6cf',
        // Solid fills and text: the brand cyan is too pale to carry white or sit on white.
        'primary-dark': '#00688a',
        'primary-hover': '#0f4f6a',
        accent: '#ff9f1c',
        deep: '#081b2d',
        'text-primary': '#0f4f6a',
        'text-muted': '#4f7084',
        'text-dim': '#648296',
        genesis: { DEFAULT: '#00a6cf', light: '#c3ecfa', dark: '#00688a' },
        nexus: { DEFAULT: '#ff9f1c', light: '#ffdf9e', dark: '#a85300' },
        biohack: { DEFAULT: '#2f9b84', light: '#bfe8da', dark: '#1b5f52' },
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
            color: '#0f4f6a',
            maxWidth: 'none',
            '--tw-prose-bullets': '#00a6cf',
            '--tw-prose-counters': '#4f7084',
            '--tw-prose-th-borders': '#cfe0e7',
            '--tw-prose-td-borders': '#cfe0e7',
            a: { color: '#00688a', textDecoration: 'underline' },
            strong: { color: '#0f4f6a', fontWeight: '600' },
            h1: { color: '#0f4f6a', marginTop: '1em', marginBottom: '0.4em' },
            h2: { color: '#0f4f6a', marginTop: '1em', marginBottom: '0.4em' },
            h3: { color: '#0f4f6a', marginTop: '0.8em', marginBottom: '0.3em' },
            h4: { color: '#0f4f6a' },
            p: { marginTop: '0.6em', marginBottom: '0.6em' },
            li: { marginTop: '0.2em', marginBottom: '0.2em' },
            code: { color: '#00688a', backgroundColor: '#ffffff', padding: '0.1em 0.3em', borderRadius: '0.25rem', fontWeight: '400' },
            'code::before': { content: '""' },
            'code::after': { content: '""' },
            pre: { backgroundColor: '#081b2d', color: '#e8f2f7', borderRadius: '0.75rem' },
            hr: { borderColor: 'rgba(0, 166, 207, 0.25)' },
            blockquote: { borderLeftColor: '#ff9f1c', color: '#4f7084' },
          },
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
