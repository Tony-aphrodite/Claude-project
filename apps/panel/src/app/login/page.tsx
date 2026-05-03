import { signInWithEmail } from "../actions/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-ocean-gradient">
      <div className="absolute inset-0 bg-[radial-gradient(800px_400px_at_30%_20%,rgba(255,255,255,0.08),transparent)]" />
      <form
        action={signInWithEmail}
        className="relative w-full max-w-sm space-y-5 rounded-2xl border border-white/10 bg-white/5 p-7 backdrop-blur-md shadow-card-elev"
      >
        <div className="space-y-1.5 text-white">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/20">
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
          <p className="text-sm text-white/70 leading-relaxed">
            Te enviamos un magic link al correo asociado a tu cuenta de Supabase.
          </p>
        </div>

        <input
          type="email"
          name="email"
          required
          placeholder="tu@dpmdiving.com"
          className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-300/40"
        />
        <button className="w-full rounded-lg bg-brand-500 py-2 text-sm font-semibold text-white shadow-card transition-colors hover:bg-brand-600">
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
