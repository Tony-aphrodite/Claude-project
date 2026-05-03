import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand: deep ocean → reef teal — the DPM Diving identity.
        brand: {
          50: "#eef9fb",
          100: "#d4f0f5",
          200: "#a8e1ea",
          300: "#73cad8",
          400: "#3eaec1",
          500: "#1d92a8",
          600: "#15748a",
          700: "#155d72",
          800: "#164b5d",
          900: "#143f4f",
          950: "#082633",
        },
        // Neutral ink — warmer than slate, designed against #f6f9fb canvas.
        ink: {
          50: "#f8fafc",
          100: "#eef2f6",
          200: "#dde3ea",
          300: "#bbc5cf",
          400: "#8b96a3",
          500: "#5e6a78",
          600: "#445261",
          700: "#2f3a47",
          800: "#1d2530",
          900: "#0f1620",
        },
        // Stage palette — each lead_stage has a distinct hue family.
        stage: {
          new: "#94a3b8",          // slate-400
          qualified: "#3b82f6",    // blue-500
          proposed: "#6366f1",     // indigo-500
          depositPending: "#f59e0b", // amber-500
          depositPaid: "#10b981",  // emerald-500
          handedOff: "#8b5cf6",    // violet-500
          closed: "#16a34a",       // green-600
          lost: "#e11d48",         // rose-600
        },
        // Semantic
        ok: { 50: "#ecfdf5", 500: "#10b981", 600: "#059669", 700: "#047857" },
        warn: { 50: "#fffbeb", 500: "#f59e0b", 600: "#d97706", 700: "#b45309" },
        bad: { 50: "#fff1f2", 500: "#e11d48", 600: "#be123c", 700: "#9f1239" },
        accent: { 500: "#1d92a8", 600: "#15748a" }, // alias to brand for legacy refs
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 22 32 / 0.04), 0 1px 3px 0 rgb(15 22 32 / 0.08)",
        "card-hover":
          "0 4px 6px -1px rgb(15 22 32 / 0.08), 0 2px 4px -2px rgb(15 22 32 / 0.06)",
        "card-elev":
          "0 10px 15px -3px rgb(15 22 32 / 0.10), 0 4px 6px -4px rgb(15 22 32 / 0.06)",
        glow: "0 0 0 4px rgb(29 146 168 / 0.12)",
      },
      backgroundImage: {
        "ocean-gradient":
          "linear-gradient(180deg, #082633 0%, #143f4f 40%, #155d72 100%)",
        "surface-gradient":
          "linear-gradient(180deg, #ffffff 0%, #f6f9fb 100%)",
        "stage-new": "linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)",
        "stage-qualified": "linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%)",
        "stage-proposed": "linear-gradient(180deg, #eef2ff 0%, #e0e7ff 100%)",
        "stage-deposit-pending":
          "linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%)",
        "stage-deposit-paid":
          "linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%)",
        "stage-handed-off": "linear-gradient(180deg, #f5f3ff 0%, #ede9fe 100%)",
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
      animation: {
        pulseSoft: "pulseSoft 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
