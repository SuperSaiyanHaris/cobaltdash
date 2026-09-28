/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', '"Inter"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        // ShinyPass (Arena) only; loaded by the pass pages, falls back to Impact.
        arena: ['"Barlow Condensed"', '"Arial Narrow"', 'Impact', 'sans-serif'],
      },
      colors: {
        // Brand purple (from the logo). Main call to action only, one per
        // view; see "Button colors" in .claude/CLAUDE.md. #7C3AED keeps white
        // text above WCAG AA contrast.
        brand: { DEFAULT: "#7C3AED", hover: "#6D28D9" },
        primary: {
          50: '#f0f9ff',
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
        accent: {
          DEFAULT: '#facc15',
          dark: '#eab308',
        }
      },
      animation: {
        'slide-up': 'slideUp 0.5s ease-out',
        'fade-in': 'fadeIn 0.6s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'roll-up': 'rollUp 0.3s ease-out forwards',
        'roll-down': 'rollDown 0.3s ease-out forwards',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        rollUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0.5' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        rollDown: {
          '0%': { transform: 'translateY(-100%)', opacity: '0.5' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}
