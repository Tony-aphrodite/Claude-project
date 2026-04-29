import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f7f7f8",
          100: "#eeeef0",
          200: "#d9d9dc",
          300: "#b8b8bd",
          500: "#75757a",
          700: "#3c3c40",
          900: "#161617",
        },
        accent: {
          500: "#0d9488",
          600: "#0f766e",
        },
        warn: { 500: "#f59e0b" },
        bad: { 500: "#dc2626" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
