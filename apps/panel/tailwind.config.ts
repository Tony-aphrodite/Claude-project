import type { Config } from "tailwindcss";

/*
 * "Abyssal Command" theme — deep-ocean dark surface inspired by a command-
 * center dashboard, but tuned to DPM Diving's identity. Two signature moves:
 *
 *  1. The `ink` scale is INVERTED versus the typical light-mode usage. ink-50
 *     is now the darkest canvas and ink-900 the brightest text. Components
 *     written with semantic ink classes (`text-ink-900`, `bg-ink-50/40`) auto-
 *     adopt dark mode without rewriting markup everywhere.
 *  2. The `brand` family shifts toward bioluminescent cyan/teal — pops against
 *     the deep canvas the way reef life pops in low light.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand: bioluminescent cyan-teal. Same DPM identity, tuned for dark.
        brand: {
          50: "#ecfeff",
          100: "#cffafe",
          200: "#a5f3fc",
          300: "#67e8f9",
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
          700: "#0e7490",
          800: "#155e75",
          900: "#164e63",
          950: "#083344",
        },
        // Ink (inverted): 50 is canvas, 900 is brightest text.
        ink: {
          50: "#040b14",   // canvas — deepest
          100: "#0a1626",  // surface 1 (cards on canvas)
          200: "#13243a",  // surface 2 / borders
          300: "#1f3149",  // hairline borders / dividers
          400: "#3a4a63",  // disabled / very muted
          500: "#5a6f8a",  // muted text / chrome
          600: "#7e91aa",  // body muted
          700: "#aabdd2",  // body
          800: "#d6e3f1",  // bright body
          900: "#f1f7fc",  // headings
        },
        // Stage palette stays semantically the same; values nudged for dark.
        stage: {
          new: "#94a3b8",
          qualified: "#60a5fa",
          proposed: "#818cf8",
          depositPending: "#fbbf24",
          depositPaid: "#34d399",
          handedOff: "#a78bfa",
          closed: "#22c55e",
          lost: "#fb7185",
        },
        // Semantic — dark-friendly variants.
        ok: { 50: "#022c22", 500: "#34d399", 600: "#10b981", 700: "#86efac" },
        warn: { 50: "#3a2206", 500: "#fbbf24", 600: "#f59e0b", 700: "#fcd34d" },
        bad: { 50: "#3b0a13", 500: "#fb7185", 600: "#f43f5e", 700: "#fda4af" },
        accent: { 500: "#22d3ee", 600: "#06b6d4" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        // Soft inner-lit cards on dark — borders alone aren't enough.
        card: "0 1px 0 0 rgb(255 255 255 / 0.04) inset, 0 1px 2px 0 rgb(0 0 0 / 0.5)",
        "card-hover":
          "0 1px 0 0 rgb(34 211 238 / 0.18) inset, 0 0 0 1px rgb(34 211 238 / 0.18), 0 6px 22px -6px rgb(34 211 238 / 0.18)",
        "card-elev":
          "0 1px 0 0 rgb(255 255 255 / 0.05) inset, 0 12px 32px -8px rgb(0 0 0 / 0.6)",
        glow: "0 0 0 1px rgb(34 211 238 / 0.30), 0 0 24px 0 rgb(34 211 238 / 0.20)",
        "glow-soft": "0 0 24px 0 rgb(34 211 238 / 0.10)",
        "glow-emerald": "0 0 0 1px rgb(52 211 153 / 0.30), 0 0 24px 0 rgb(52 211 153 / 0.18)",
      },
      backgroundImage: {
        // Hero — slow vertical descent into the abyss.
        "abyss-hero":
          "linear-gradient(135deg, rgba(34,211,238,0.10) 0%, rgba(8,51,68,0.6) 30%, rgba(4,11,20,0.95) 100%)",
        // Sidebar — subtle deep gradient, less saturated than hero.
        "abyss-rail":
          "linear-gradient(180deg, #06121d 0%, #040b14 100%)",
        // Surface gradient for cards (very subtle).
        "surface-gradient":
          "linear-gradient(180deg, rgba(19,36,58,0.55) 0%, rgba(10,22,38,0.55) 100%)",
        // Stage column gradients tuned for dark.
        "stage-new": "linear-gradient(180deg, rgba(148,163,184,0.10) 0%, rgba(148,163,184,0.04) 100%)",
        "stage-qualified": "linear-gradient(180deg, rgba(96,165,250,0.12) 0%, rgba(96,165,250,0.04) 100%)",
        "stage-proposed": "linear-gradient(180deg, rgba(129,140,248,0.12) 0%, rgba(129,140,248,0.04) 100%)",
        "stage-deposit-pending":
          "linear-gradient(180deg, rgba(251,191,36,0.14) 0%, rgba(251,191,36,0.04) 100%)",
        "stage-deposit-paid":
          "linear-gradient(180deg, rgba(52,211,153,0.14) 0%, rgba(52,211,153,0.04) 100%)",
        "stage-handed-off":
          "linear-gradient(180deg, rgba(167,139,250,0.12) 0%, rgba(167,139,250,0.04) 100%)",
        // Caustic — the signature animated underwater shimmer used on the hero.
        caustic:
          "radial-gradient(60% 80% at 30% 20%, rgba(34,211,238,0.18), transparent 60%), radial-gradient(50% 60% at 80% 0%, rgba(52,211,153,0.10), transparent 60%)",
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        // Caustic shimmer — slow drift mimicking sunlight through water.
        caustic: {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)", opacity: "0.9" },
          "50%": { transform: "translate3d(2%,1%,0) scale(1.04)", opacity: "1" },
        },
      },
      animation: {
        pulseSoft: "pulseSoft 2s ease-in-out infinite",
        caustic: "caustic 14s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
