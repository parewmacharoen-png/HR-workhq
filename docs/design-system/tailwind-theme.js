/**
 * WorkHQ UX-01 — Tailwind CSS v4 / v3 Theme Extension
 *
 * Recommended stack: Tailwind CSS + shadcn/ui (customized) + Radix primitives
 * Install when beginning UX-01 implementation — not wired yet.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        whq: {
          bg: '#f7f4ef',
          'bg-subtle': '#faf8f5',
          surface: '#ffffff',
          border: '#ebe6df',
          'border-strong': '#d9d0c4',
          text: '#2c2419',
          muted: '#7a6f62',
          primary: {
            DEFAULT: '#6b9b7a',
            hover: '#5a8568',
            subtle: '#e8f0ea',
            foreground: '#2e4a36',
          },
          secondary: {
            DEFAULT: '#8b7355',
            hover: '#756048',
            subtle: '#f5f1eb',
          },
          accent: {
            warm: '#e8a87c',
            'warm-subtle': '#fdf3eb',
            cool: '#7eb8c9',
            'cool-subtle': '#edf6f9',
          },
          success: { DEFAULT: '#4a7c59', bg: '#e8f0ea' },
          warning: { DEFAULT: '#c4923a', bg: '#fdf6e8' },
          danger: { DEFAULT: '#c45c5c', bg: '#fdf0f0' },
          info: { DEFAULT: '#5a8fb8', bg: '#edf4fa' },
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Thai"', '"Noto Sans Thai"', 'system-ui', 'sans-serif'],
        display: ['"IBM Plex Sans Thai"', '"Noto Sans Thai"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'whq-xs': ['0.75rem', { lineHeight: '1.55' }],
        'whq-sm': ['0.8125rem', { lineHeight: '1.55' }],
        'whq-base': ['0.9375rem', { lineHeight: '1.55' }],
        'whq-lg': ['1.0625rem', { lineHeight: '1.45' }],
        'whq-xl': ['1.25rem', { lineHeight: '1.35' }],
        'whq-2xl': ['1.5rem', { lineHeight: '1.25' }],
        'whq-3xl': ['1.875rem', { lineHeight: '1.2' }],
      },
      borderRadius: {
        'whq-sm': '8px',
        'whq-md': '12px',
        'whq-lg': '16px',
        'whq-xl': '20px',
      },
      boxShadow: {
        'whq-xs': '0 1px 2px rgba(44, 36, 25, 0.04)',
        'whq-sm': '0 2px 8px rgba(44, 36, 25, 0.06)',
        'whq-md': '0 4px 16px rgba(44, 36, 25, 0.08)',
        'whq-lg': '0 8px 32px rgba(44, 36, 25, 0.1)',
        'whq-card': '0 2px 12px rgba(44, 36, 25, 0.05)',
        'whq-card-hover': '0 6px 24px rgba(107, 155, 122, 0.12)',
      },
      spacing: {
        sidebar: '272px',
        topbar: '64px',
      },
      maxWidth: {
        content: '1280px',
      },
      transitionTimingFunction: {
        whq: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};
