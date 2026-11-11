/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Colour tokens come from the active theme (src/renderer/src/lib/themes.ts → CSS variables).
        // One flat background everywhere; panels are separated by spacing, not lines.
        surface: {
          0: 'rgb(var(--surface-0) / <alpha-value>)',
          1: 'rgb(var(--surface-0) / <alpha-value>)',
          2: 'rgb(var(--surface-0) / <alpha-value>)',
          3: 'rgb(var(--surface-3) / <alpha-value>)', // menus, inputs, floating bars
          4: 'rgb(var(--surface-4) / <alpha-value>)', // hover / selected
        },
        border: {
          subtle: 'rgb(var(--border-subtle) / <alpha-value>)',
          default: 'rgb(var(--border-default) / <alpha-value>)',
          strong: 'rgb(var(--border-strong) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--text-tertiary) / <alpha-value>)',
          disabled: 'rgb(var(--text-disabled) / <alpha-value>)',
        },
        accent: {
          blue: 'rgb(var(--accent-blue) / <alpha-value>)',
          purple: 'rgb(var(--accent-purple) / <alpha-value>)',
          green: 'rgb(var(--accent-green) / <alpha-value>)',
          orange: 'rgb(var(--accent-orange) / <alpha-value>)',
          red: 'rgb(var(--accent-red) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        arabic: ['IBM Plex Sans Arabic', 'Noto Sans Arabic', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['11px', '14px'],
        xs: ['12px', '16px'],
        sm: ['13px', '18px'],
      },
      borderRadius: {
        DEFAULT: '6px',
      },
      boxShadow: {
        pop: '0 8px 24px -6px rgba(0,0,0,.55)',
      },
      keyframes: {
        ripple: {
          '0%': { transform: 'translate(-50%,-50%) scale(.3)', opacity: '.55' },
          '100%': { transform: 'translate(-50%,-50%) scale(1.6)', opacity: '0' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        pulseDot: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '.35' },
        },
        toastIn: {
          '0%': { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        toastOut: {
          '0%': { opacity: '1', transform: 'none' },
          '100%': { opacity: '0', transform: 'translateX(-12px)' },
        },
        toastBar: {
          '0%': { transform: 'scaleX(1)' },
          '100%': { transform: 'scaleX(0)' },
        },
        slideFromRight: {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        slideFromLeft: {
          '0%': { opacity: '0', transform: 'translateX(-24px)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        shake: {
          '0%,100%': { transform: 'none' },
          '25%': { transform: 'translateX(-4px)' },
          '75%': { transform: 'translateX(4px)' },
        },
      },
      animation: {
        ripple: 'ripple .45s ease-out forwards',
        fadeIn: 'fadeIn .14s ease-out',
        pulseDot: 'pulseDot 1.4s ease-in-out infinite',
        toastIn: 'toastIn .18s ease-out',
        toastOut: 'toastOut .16s ease-in forwards',
        slideFromRight: 'slideFromRight .22s ease-out',
        slideFromLeft: 'slideFromLeft .22s ease-out',
        shake: 'shake .25s ease-in-out',
      },
    },
  },
  plugins: [],
}
