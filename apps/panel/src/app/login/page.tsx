import { signInWithEmail } from "../actions/auth";

// Bubble field — 30 particles scattered across the viewport with handpicked
// duration/size/x/drift so the deck looks organic without RNG in JS (which
// would re-roll on every render). Tuned to feel ambient, not busy.
const BUBBLES: Array<{
  x: string;
  size: number;
  duration: number;
  delay: number;
  drift: number;
  opacity: number;
}> = [
  { x: "4%", size: 5, duration: 24, delay: 3, drift: 18, opacity: 0.40 },
  { x: "8%", size: 6, duration: 22, delay: 0, drift: 24, opacity: 0.45 },
  { x: "12%", size: 8, duration: 19, delay: 13, drift: -22, opacity: 0.50 },
  { x: "14%", size: 4, duration: 28, delay: 6, drift: -18, opacity: 0.35 },
  { x: "18%", size: 5, duration: 25, delay: 17, drift: 20, opacity: 0.40 },
  { x: "22%", size: 9, duration: 18, delay: 2, drift: 30, opacity: 0.55 },
  { x: "26%", size: 3, duration: 32, delay: 18, drift: 10, opacity: 0.25 },
  { x: "31%", size: 5, duration: 26, delay: 10, drift: -22, opacity: 0.40 },
  { x: "34%", size: 7, duration: 20, delay: 7, drift: 16, opacity: 0.50 },
  { x: "38%", size: 7, duration: 20, delay: 14, drift: 16, opacity: 0.50 },
  { x: "42%", size: 4, duration: 29, delay: 21, drift: -14, opacity: 0.30 },
  { x: "47%", size: 4, duration: 30, delay: 4, drift: -12, opacity: 0.30 },
  { x: "50%", size: 11, duration: 16, delay: 9, drift: 26, opacity: 0.55 },
  { x: "54%", size: 8, duration: 19, delay: 12, drift: 28, opacity: 0.55 },
  { x: "58%", size: 5, duration: 24, delay: 19, drift: -20, opacity: 0.40 },
  { x: "62%", size: 5, duration: 25, delay: 8, drift: -24, opacity: 0.40 },
  { x: "65%", size: 3, duration: 34, delay: 22, drift: -8, opacity: 0.25 },
  { x: "68%", size: 6, duration: 22, delay: 15, drift: 22, opacity: 0.45 },
  { x: "70%", size: 6, duration: 23, delay: 16, drift: 14, opacity: 0.45 },
  { x: "74%", size: 4, duration: 28, delay: 23, drift: -16, opacity: 0.35 },
  { x: "78%", size: 10, duration: 17, delay: 1, drift: -30, opacity: 0.55 },
  { x: "82%", size: 5, duration: 26, delay: 11, drift: 20, opacity: 0.40 },
  { x: "85%", size: 4, duration: 27, delay: 11, drift: 20, opacity: 0.35 },
  { x: "88%", size: 7, duration: 21, delay: 25, drift: -18, opacity: 0.50 },
  { x: "91%", size: 7, duration: 21, delay: 5, drift: -16, opacity: 0.50 },
  { x: "94%", size: 5, duration: 23, delay: 19, drift: 14, opacity: 0.40 },
  { x: "16%", size: 3, duration: 35, delay: 27, drift: 8, opacity: 0.20 },
  { x: "44%", size: 3, duration: 33, delay: 14, drift: -10, opacity: 0.22 },
  { x: "73%", size: 3, duration: 31, delay: 6, drift: 12, opacity: 0.22 },
  { x: "97%", size: 4, duration: 30, delay: 24, drift: -16, opacity: 0.30 },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">
      {/* Caustic shimmer — same animated underwater glow used across the app */}
      <div
        className="absolute inset-0 bg-caustic animate-caustic pointer-events-none"
        aria-hidden
      />

      {/* Ambient bubble field — pure CSS animation, no client JS */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        {BUBBLES.map((b, i) => (
          <span
            key={i}
            className="bubble-particle"
            style={
              {
                "--bubble-x": b.x,
                "--bubble-size": `${b.size}px`,
                "--bubble-duration": `${b.duration}s`,
                "--bubble-delay": `${b.delay}s`,
                "--bubble-drift": `${b.drift}px`,
                "--bubble-opacity": b.opacity,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* Login card */}
      <form
        action={signInWithEmail}
        className="relative z-10 w-full max-w-sm space-y-5 rounded-2xl border border-ink-200/60 bg-surface-gradient p-7 shadow-card-elev backdrop-blur-md"
      >
        <div className="space-y-1.5 text-ink-900">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-400/30 bg-brand-400/10 text-brand-300 shadow-glow-soft">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                <path
                  d="M4 14c2.5-2 5.5-2 8 0s5.5 2 8 0M4 18c2.5-2 5.5-2 8 0s5.5 2 8 0"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <circle cx="12" cy="7" r="3" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold">DPM Diving · Panel</h1>
          </div>
          <p className="text-sm text-ink-500 leading-relaxed">
            Te enviamos un magic link al correo asociado a tu cuenta de Supabase.
          </p>
        </div>

        <input
          type="email"
          name="email"
          required
          placeholder="tu@dpmdiving.com"
          className="w-full rounded-lg border border-ink-300/70 bg-ink-100/70 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-500 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
        />
        <button className="w-full rounded-lg bg-brand-500 py-2 text-sm font-semibold text-white shadow-glow-soft transition-all hover:bg-brand-600 hover:shadow-glow">
          Enviar magic link
        </button>

        {params.sent === "1" && (
          <div className="rounded-lg bg-ok-500/15 px-3 py-2 text-sm text-ok-50 ring-1 ring-inset ring-ok-500/30">
            Listo. Revisá tu correo.
          </div>
        )}
        {params.error && (
          <div className="rounded-lg bg-bad-500/15 px-3 py-2 text-sm text-bad-50 ring-1 ring-inset ring-bad-500/30">
            Error: {params.error}
          </div>
        )}
      </form>
    </div>
  );
}
