import { redirect } from "next/navigation";

import { PageHeader } from "~/app/_components/page-header";
import { changePassword, signOut } from "~/app/actions/auth";
import { getSupabaseServer } from "~/lib/supabase";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  fields_required: "Completá los tres campos.",
  password_too_short: "La contraseña nueva tiene que tener al menos 8 caracteres.",
  passwords_dont_match: "La nueva contraseña y la confirmación no coinciden.",
  same_password: "La nueva contraseña no puede ser igual a la actual.",
  invalid_current_password: "La contraseña actual no es correcta.",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const sp = await searchParams;
  const sb = await getSupabaseServer();
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) {
    redirect("/login");
  }
  const user = data.user;

  const errorMsg = sp.error ? (ERROR_MESSAGES[sp.error] ?? sp.error) : null;
  const showSuccess = sp.success === "1";

  return (
    <>
      <PageHeader
        eyebrow="Cuenta"
        title="Mi cuenta"
        description="Tus credenciales de acceso al panel. Cambiar contraseña requiere confirmar la actual."
      />

      <section className="card">
        <div className="space-y-1">
          <div className="metric-label">Email</div>
          <div className="text-sm font-medium text-ink-900">{user.email}</div>
        </div>
      </section>

      <section className="card">
        <header className="mb-4">
          <h2 className="h-section">Cambiar contraseña</h2>
          <p className="metric-sub mt-1">
            Mínimo 8 caracteres. Te recomiendo una passphrase larga (cuatro
            palabras al azar) en lugar de algo críptico — es más fácil de
            recordar y más segura.
          </p>
        </header>

        <form action={changePassword} className="space-y-3 max-w-md">
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1">
              Contraseña actual
            </label>
            <input
              type="password"
              name="currentPassword"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-ink-300/70 bg-ink-100/70 px-3 py-2 text-sm text-ink-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1">
              Nueva contraseña
            </label>
            <input
              type="password"
              name="newPassword"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-lg border border-ink-300/70 bg-ink-100/70 px-3 py-2 text-sm text-ink-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1">
              Confirmar nueva contraseña
            </label>
            <input
              type="password"
              name="confirmPassword"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-lg border border-ink-300/70 bg-ink-100/70 px-3 py-2 text-sm text-ink-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
            />
          </div>

          {errorMsg && (
            <div className="rounded-lg bg-bad-500/15 px-3 py-2 text-sm text-bad-700 ring-1 ring-inset ring-bad-500/30">
              {errorMsg}
            </div>
          )}
          {showSuccess && (
            <div className="rounded-lg bg-ok-500/15 px-3 py-2 text-sm text-ok-700 ring-1 ring-inset ring-ok-500/30">
              Contraseña actualizada. La próxima sesión va a usar la contraseña nueva.
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button className="btn-primary">Actualizar contraseña</button>
          </div>
        </form>
      </section>

      <section className="card flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-ink-900">Cerrar sesión</div>
          <div className="metric-sub mt-1">
            Termina la sesión actual en este navegador.
          </div>
        </div>
        <form action={signOut}>
          <button className="btn-ghost text-bad-700 hover:bg-bad-50">
            Cerrar sesión
          </button>
        </form>
      </section>
    </>
  );
}
