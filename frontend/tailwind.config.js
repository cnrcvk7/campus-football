/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Existing brand blue — unchanged so no existing classes break
        brand: {
          50:  '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        // Semantic tokens backed by CSS variables.
        // Use these in new/updated components so light ↔ dark switching is
        // handled by toggling the `dark` class on <html> — no Tailwind
        // dark: prefix needed on every element.
        //
        // Usage: bg-cf-background, text-cf-foreground, border-cf-border, etc.
        'cf-background':         'rgb(var(--cf-background) / <alpha-value>)',
        'cf-foreground':         'rgb(var(--cf-foreground) / <alpha-value>)',
        'cf-surface':            'rgb(var(--cf-surface) / <alpha-value>)',
        'cf-surface-foreground': 'rgb(var(--cf-surface-foreground) / <alpha-value>)',
        'cf-muted':              'rgb(var(--cf-muted) / <alpha-value>)',
        'cf-muted-foreground':   'rgb(var(--cf-muted-foreground) / <alpha-value>)',
        'cf-border':             'rgb(var(--cf-border) / <alpha-value>)',
        'cf-brand':              'rgb(var(--cf-brand) / <alpha-value>)',
        'cf-brand-hover':        'rgb(var(--cf-brand-hover) / <alpha-value>)',
        'cf-brand-foreground':   'rgb(var(--cf-brand-foreground) / <alpha-value>)',
        'cf-nav':                'rgb(var(--cf-nav) / <alpha-value>)',
        'cf-nav-border':         'rgb(var(--cf-nav-border) / <alpha-value>)',
        'cf-nav-foreground':     'rgb(var(--cf-nav-foreground) / <alpha-value>)',
        'cf-nav-muted':          'rgb(var(--cf-nav-muted) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
