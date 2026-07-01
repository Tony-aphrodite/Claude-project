import { notFound } from "next/navigation";

import { PageHeader } from "~/app/_components/page-header";
import {
  consumeNewUserFlash,
  createPanelUserAction,
  deletePanelUserAction,
  listPanelUsers,
} from "~/app/actions/admin-users";
import { requireUserContext } from "~/lib/auth-context";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: "Email inválido.",
  invalid_role: "Rol inválido.",
  invalid_sede: "Sede inválida. Tiene que ser una de las 5 oficiales.",
  create_failed: "Supabase rechazó la creación.",
  update_failed: "Supabase rechazó la actualización.",
  delete_failed: "No pude revocar acceso. Probá de nuevo.",
  cannot_delete_self:
    "No te podés revocar a vos mismo desde acá — perderías acceso a esta misma pantalla.",
  missing_id: "Falta el id de usuario.",
};

const VALID_SEDES = [
  "Gili Trawangan",
  "Gili Air",
  "Koh Tao",
  "Koh Phi Phi",
  "Nusa Penida",
] as const;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    detail?: string;
    created?: string;
    deleted?: string;
  }>;
}) {
  // Hard gate: only admins land here. Office users hitting the URL get a
  // 404 (route appears not to exist) rather than a "forbidden" message
  // that would reveal the feature exists.
  const me = await requireUserContext();
  if (me.role !== "admin") {
    notFound();
  }

  const [params, users, flash] = await Promise.all([
    searchParams,
    listPanelUsers(),
    consumeNewUserFlash(),
  ]);

  const errorMsg = params.error
    ? (ERROR_MESSAGES[params.error] ?? params.error) +
      (params.detail ? ` (${decodeURIComponent(params.detail)})` : "")
    : null;

  return (
    <>
      <PageHeader
        eyebrow="Administración"
        title="Usuarios del panel"
        description="Cuentas que pueden entrar al panel. Los oficina solo ven la sede asignada. Los admin ven todas las sedes y pueden crear o revocar accesos desde acá."
      />

      {/* Flash: just-created credentials (shown ONCE) ──────────────── */}
      {flash && (
        <section
          className="card flex items-start gap-3 ring-1 ring-inset ring-ok-500/30 bg-ok-500/10"
          role="status"
        >
          <span className="mt-0.5 shrink-0 text-ok-700">
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
              <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M6.5 10.2l2.5 2.5 4.5-5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="text-sm leading-relaxed space-y-2">
            <p className="font-semibold text-ink-900">
              Credenciales creadas — copialas ahora, no se vuelven a mostrar.
            </p>
            <div className="space-y-1 font-mono text-xs">
              <div>
                <span className="text-ink-500">Email:&nbsp;&nbsp;</span>
                <span className="text-ink-900 select-all">{flash.email}</span>
              </div>
              <div>
                <span className="text-ink-500">Password:</span>{" "}
                <span className="text-ink-900 select-all">{flash.password}</span>
              </div>
              <div>
                <span className="text-ink-500">Rol:&nbsp;&nbsp;&nbsp;&nbsp;</span>
                <span className="text-ink-900">{flash.role}</span>
                {flash.sede && (
                  <>
                    <span className="text-ink-500"> · Sede: </span>
                    <span className="text-ink-900">{flash.sede}</span>
                  </>
                )}
              </div>
            </div>
            <p className="text-ink-700 text-xs">
              Mandale estas credenciales por un canal seguro (NO email).
              Después de cerrar esta pantalla solo se podrá resetear la
              contraseña creando el usuario otra vez con el mismo email.
            </p>
          </div>
        </section>
      )}

      {/* Status banners ─────────────────────────────────────────────── */}
      {params.deleted === "1" && !flash && (
        <section className="card ring-1 ring-inset ring-ok-500/30 bg-ok-500/10 !py-3 text-sm text-ink-700">
          ✓ Acceso revocado. La próxima request del usuario lo va a redirigir
          al login.
        </section>
      )}
      {params.created === "1" && !flash && (
        <section className="card ring-1 ring-inset ring-warn-500/30 bg-warn-500/10 !py-3 text-sm text-ink-700">
          ⚠ El usuario se creó pero ya cerraste la pantalla con las
          credenciales. Volvé a "crear usuario" con el mismo email para
          generar una contraseña nueva.
        </section>
      )}
      {errorMsg && (
        <section className="card ring-1 ring-inset ring-bad-500/30 bg-bad-500/15 !py-3 text-sm text-bad-700">
          Error: {errorMsg}
        </section>
      )}

      {/* Create form ───────────────────────────────────────────────── */}
      <section className="card">
        <header className="mb-4">
          <h2 className="h-section">Crear / actualizar usuario</h2>
          <p className="metric-sub mt-1">
            Si el email ya existe, se actualiza el rol/sede y se genera una
            contraseña nueva. Si no existe, se crea desde cero.
          </p>
        </header>
        <form action={createPanelUserAction} className="grid gap-3 md:grid-cols-4">
          <label className="text-xs">
            <div className="metric-label mb-1">Email</div>
            <input
              type="email"
              name="email"
              required
              placeholder="oficina-sede@dpmdiving.com"
              className="w-full rounded-lg border border-ink-300/70 bg-ink-100/70 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-500 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
            />
          </label>
          <label className="text-xs">
            <div className="metric-label mb-1">Rol</div>
            <select name="role" defaultValue="office" className="select w-full">
              <option value="office">oficina (una sede)</option>
              <option value="admin">admin (todas las sedes)</option>
            </select>
          </label>
          <label className="text-xs">
            <div className="metric-label mb-1">
              Sede (oficina: una sede o todas)
            </div>
            <select name="sede" defaultValue="" className="select w-full">
              <option value="">—</option>
              {/* Miguel 2026-07-01 #7 — cross-sede oficina for the remote
                  24/7 team. Value "todas" tells auth-context to keep
                  role=office with sedeId=null (office privileges across
                  every sede, no admin surfaces). */}
              <option value="todas">Todas las sedes (remoto 24/7)</option>
              {VALID_SEDES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full">
              Crear / actualizar
            </button>
          </div>
        </form>
      </section>

      {/* User list ─────────────────────────────────────────────────── */}
      <section className="card !p-0 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th className="pl-5">Email</th>
              <th>Rol</th>
              <th>Sede</th>
              <th>Creado</th>
              <th className="pr-5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="pl-5 font-medium text-ink-900">{u.email}</td>
                <td>
                  {u.role === "admin" ? (
                    <span className="badge-brand">admin</span>
                  ) : (
                    <span className="badge-neutral">oficina</span>
                  )}
                </td>
                <td className="text-sm text-ink-700">
                  {u.role === "office" && !u.sede ? (
                    <span className="italic text-ink-500">
                      todas <span className="text-[10px]">· remoto</span>
                    </span>
                  ) : u.sede ? (
                    u.sede
                  ) : (
                    <span className="text-ink-500 italic">todas</span>
                  )}
                </td>
                <td className="text-xs text-ink-500 tabular-nums">
                  {u.createdAt
                    ? new Date(u.createdAt).toLocaleDateString()
                    : "—"}
                </td>
                <td className="pr-5 text-right">
                  {u.id === me.userId ? (
                    <span className="text-xs text-ink-500 italic">
                      (sos vos)
                    </span>
                  ) : (
                    <form action={deletePanelUserAction} className="inline">
                      <input type="hidden" name="userId" value={u.id} />
                      <button
                        type="submit"
                        className="text-sm font-medium text-bad-700 hover:text-bad-600"
                      >
                        Revocar
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="text-center text-sm text-ink-500 py-12">
            Sin usuarios todavía.
          </div>
        )}
      </section>
    </>
  );
}
