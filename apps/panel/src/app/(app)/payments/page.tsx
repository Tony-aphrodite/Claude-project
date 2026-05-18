import { DEPOSIT_AMOUNT, type LeadMetadata } from "@dpm/shared";

import { PageHeader } from "~/app/_components/page-header";
import { ageTone, elapsedHours, formatElapsed } from "~/app/_components/stage";
import { confirmDepositReceived, markLeadLost } from "~/app/actions/leads";
import { requireUserContext } from "~/lib/auth-context";
import { listDepositPending } from "~/lib/db-queries";

export const dynamic = "force-dynamic";

const TONE_PILL: Record<"ok" | "warn" | "bad", string> = {
  ok: "bg-ok-50 text-ok-700 ring-ok-500/20",
  warn: "bg-warn-50 text-warn-700 ring-warn-500/30",
  bad: "bg-bad-50 text-bad-700 ring-bad-500/30",
};

// Compact OCR result chip surfacing the AI's pre-flight verdict on a
// payment receipt. Helps the operator decide whether to click Confirm
// without opening the conversation thread.
function OcrChip({ result }: { result: NonNullable<LeadMetadata["ocr_result"]> }) {
  if (!result.ok) {
    const reasonLabel: Record<string, string> = {
      screenshot_rejected: "Screenshot — pidió PDF",
      fetch_failed: "No se pudo leer",
      model_failed: "Modelo falló",
      no_anthropic_key: "OCR no configurado",
      missing_attachment_url: "Sin adjunto",
    };
    const label = reasonLabel[result.reason ?? ""] ?? result.reason ?? "OCR error";
    return <span className="badge-warn" title={`OCR: ${label}`}>{label}</span>;
  }
  if (result.validated) {
    const ext = result.extraction;
    const tooltip = ext
      ? `Monto: ${ext.amount} ${ext.currency} · Ref: ${ext.refCode} · Beneficiario: ${ext.beneficiary ?? "—"}`
      : "AI verificó";
    return <span className="badge-ok" title={tooltip}>AI ✓</span>;
  }
  // Mismatch case — show the failed field(s) succinctly.
  const mismatchLabels: Record<string, string> = {
    amount_mismatch: "monto",
    amount_missing: "monto",
    currency_mismatch: "moneda",
    currency_missing: "moneda",
    ref_code_mismatch: "ref",
    ref_code_missing: "ref",
  };
  const summary = (result.mismatches ?? [])
    .map((m) => mismatchLabels[m] ?? m)
    .join(", ");
  return <span className="badge-warn" title={`No coincide: ${summary || "varios campos"}`}>AI ⚠ {summary || "?"}</span>;
}

export default async function PaymentsPage() {
  // Office users are scoped to their own sede — Miguel's hard requirement
  // ("solo tengan acceso a lo que necesitan ver que es sobre todo la de
  // depositos que tienen que aceptar"). Admins see all pending deposits
  // across every sede. Sede assignment lives in Supabase user_metadata
  // and is resolved by requireUserContext.
  const user = await requireUserContext();
  const rows = await listDepositPending(
    user.role === "office" && user.sedeId
      ? { sedeId: user.sedeId }
      : {},
  );
  const total = rows.length;
  const requiringHuman = rows.filter((r) => {
    const meta = (r.conv.leadMetadata as LeadMetadata | null) ?? {};
    return meta.requires_human_verification ?? true;
  }).length;
  const stale = rows.filter((r) => elapsedHours(r.conv.leadStageChangedAt) >= 24).length;

  return (
    <>
      <PageHeader
        eyebrow="Verificación humana"
        title="Depósitos pendientes"
        description={`Conversaciones esperando que confirmes que el depósito de ${DEPOSIT_AMOUNT} llegó vía Wise / Revolut / banco. Confirmar dispara el aviso al cliente y entrega la conversación a tu equipo de la sede.`}
      />

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card relative overflow-hidden">
          <span className="absolute left-0 top-0 h-full w-1 bg-warn-500" />
          <div className="metric-label">Pendientes</div>
          <div className="metric-value mt-2">{total}</div>
          <div className="metric-sub mt-1">total esperando confirmación</div>
        </div>
        <div className="card">
          <div className="metric-label">Manual (Wise / Revolut / banco)</div>
          <div className="metric-value mt-2">{requiringHuman}</div>
          <div className="metric-sub mt-1">requieren acción humana</div>
        </div>
        <div className="card relative overflow-hidden">
          <span className="absolute left-0 top-0 h-full w-1 bg-bad-500" />
          <div className="metric-label">Stale (&gt; 24h)</div>
          <div className="metric-value mt-2">{stale}</div>
          <div className="metric-sub mt-1">priorizar / decidir si perdido</div>
        </div>
      </section>

      {rows.length === 0 ? (
        <div className="card text-center py-12">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-ok-50 text-ok-700">
            <svg viewBox="0 0 20 20" fill="none" className="h-6 w-6">
              <path
                d="M5 10.5l3 3 7-7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="text-sm text-ink-500">
            No hay depósitos pendientes de verificación.
          </div>
        </div>
      ) : (
        <div className="card !p-0 overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th className="pl-5">Cliente</th>
                <th>Sede</th>
                <th>Referencia</th>
                <th>Monto</th>
                <th>Esperando</th>
                <th>OCR</th>
                <th>Verificación</th>
                <th className="pr-5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = (r.conv.leadMetadata as LeadMetadata | null) ?? {};
                const hours = elapsedHours(r.conv.leadStageChangedAt);
                const tone = ageTone("deposit_pending", hours);
                const requiresHuman = meta.requires_human_verification ?? true;
                const initials = (r.contact?.name ?? "—")
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((s) => s[0]?.toUpperCase() ?? "")
                  .join("");
                return (
                  <tr key={r.conv.id}>
                    <td className="pl-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/10 text-brand-700 text-[11px] font-semibold">
                          {initials || "·"}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-ink-900 truncate">
                            {r.contact?.name ?? "—"}
                          </div>
                          <div className="text-xs text-ink-500 font-mono">
                            {r.contact?.phone ?? r.conv.respondIoContactId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="text-ink-700">{r.sedeName}</td>
                    <td>
                      <span className="rounded bg-ink-900/[0.04] px-2 py-0.5 font-mono text-xs text-ink-800 ring-1 ring-inset ring-ink-200">
                        {meta.ref_code ?? "—"}
                      </span>
                    </td>
                    <td className="tabular-nums">
                      <span className="font-semibold text-ink-900">
                        {meta.deposit_amount ?? DEPOSIT_AMOUNT}
                      </span>{" "}
                      <span className="text-xs text-ink-500">
                        {meta.deposit_currency ?? "—"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 font-mono text-[11px] ring-1 ring-inset ${TONE_PILL[tone]}`}
                      >
                        {formatElapsed(hours)}
                      </span>
                    </td>
                    <td className="text-xs whitespace-nowrap">
                      {meta.ocr_result ? <OcrChip result={meta.ocr_result} /> : <span className="text-ink-400">—</span>}
                    </td>
                    <td className="text-xs">
                      {requiresHuman ? (
                        <span className="badge-warn">manual</span>
                      ) : (
                        <span className="badge-ok">Stripe webhook</span>
                      )}
                    </td>
                    <td className="pr-5 text-right whitespace-nowrap space-x-2">
                      <form action={confirmDepositReceived} className="inline">
                        <input type="hidden" name="conversacionId" value={r.conv.id} />
                        <button type="submit" className="btn-ok">
                          Confirmar
                        </button>
                      </form>
                      <form action={markLeadLost} className="inline">
                        <input type="hidden" name="conversacionId" value={r.conv.id} />
                        <input type="hidden" name="note" value="panel:deposit_no_show" />
                        <button type="submit" className="btn-ghost text-bad-700 hover:bg-bad-50">
                          Perdido
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
