import { notFound } from "next/navigation";

import { getConversation } from "~/lib/db-queries";

export const dynamic = "force-dynamic";

export default async function ConversationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const conv = await getConversation(id);
  if (!conv) notFound();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">
          {conv.conv.clientName ?? "Cliente sin nombre"}
        </h1>
        <div className="text-sm text-ink-500">
          {conv.sedeName} · {conv.conv.clientPhone} · {conv.conv.status} ·
          {" "}{conv.conv.clientLanguage ?? "lang ?"}
        </div>
      </header>

      <div className="card space-y-3 max-h-[70vh] overflow-y-auto">
        {conv.messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.sender === "cliente" ? "justify-start" : "justify-end"}`}
          >
            <div
              className={
                "max-w-md rounded-lg px-3 py-2 text-sm whitespace-pre-wrap " +
                (m.sender === "cliente"
                  ? "bg-ink-100 text-ink-900"
                  : m.sender === "ai"
                    ? "bg-accent-500/10 text-ink-900"
                    : "bg-warn-500/10 text-ink-900")
              }
            >
              <div className="text-xs text-ink-500 mb-1">
                {m.sender === "cliente"
                  ? "Cliente"
                  : m.sender === "ai"
                    ? "AI"
                    : `Agente${m.agenteName ? ` (${m.agenteName})` : ""}`}
                {" · "}
                {new Date(m.createdAt).toLocaleString()}
              </div>
              {m.content}
            </div>
          </div>
        ))}
        {conv.messages.length === 0 && (
          <div className="text-center text-sm text-ink-500 py-6">
            Sin mensajes en esta conversación.
          </div>
        )}
      </div>
    </div>
  );
}
