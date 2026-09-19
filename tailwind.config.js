/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#05070a",
          900: "#0b0f14",
          800: "#101720",
          700: "#161f2b",
          600: "#202c3a",
        },
        alert: {
          live: "#22e07a",
          recent: "#f5b942",
          stale: "#ef4d4d",
          unknown: "#5b6472",
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.06), 0 8px 24px rgba(0,0,0,0.45)",
      },
      animation: {
        "pulse-live": "pulse-live 1.6s ease-in-out infinite",
        "ping-slow": "ping-slow 1.8s cubic-bezier(0,0,0.2,1) infinite",
      },
      keyframes: {
        "pulse-live": {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.45 },
        },
        "ping-slow": {
          "0%": { transform: "scale(1)", opacity: 0.7 },
          "100%": { transform: "scale(2.4)", opacity: 0 },
        },
      },
    },
  },
  plugins: [],
};
