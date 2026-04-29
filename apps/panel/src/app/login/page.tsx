import { signInWithEmail } from "../actions/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-50">
      <form
        action={signInWithEmail}
        className="w-full max-w-sm card space-y-4"
      >
        <h1 className="text-xl font-semibold text-ink-900">DPM Panel</h1>
        <p className="text-sm text-ink-500">
          Te enviamos un magic link al correo asociado a tu cuenta de Supabase.
        </p>
        <input
          type="email"
          name="email"
          required
          placeholder="tu@dpmdiving.com"
          className="w-full border border-ink-200 rounded px-3 py-2 text-sm"
        />
        <button className="w-full bg-ink-900 text-white py-2 rounded text-sm">
          Enviar magic link
        </button>
        {params.sent === "1" && (
          <div className="text-sm text-accent-600">Listo. Revisá tu correo.</div>
        )}
        {params.error && (
          <div className="text-sm text-bad-500">Error: {params.error}</div>
        )}
      </form>
    </div>
  );
}
