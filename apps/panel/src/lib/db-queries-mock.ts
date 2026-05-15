// Mock dataset for UI-only smoke tests. Used by db-queries.ts when
// DEV_MOCK_DATA=1 (and NODE_ENV !== production). The shape mirrors what the
// real Drizzle queries return so pages render without code changes.
//
// Numbers are intentionally non-round and times use ISO strings the panel
// formatter handles cleanly; nothing here is sensitive.

import type {
  ChatContact,
  Conversacion,
  Mensaje,
  Sede,
} from "@dpm/db";
import type { LeadMetadata } from "@dpm/shared";

type ConversationRow = {
  conv: Conversacion;
  contact: ChatContact | null;
  sedeName: string | null;
};

function mockContact(input: {
  respondIoContactId: string;
  phone: string;
  name: string;
  language: string;
  tags: string[];
  sedeId: string;
}): ChatContact {
  return {
    respondIoContactId: input.respondIoContactId,
    phone: input.phone,
    name: input.name,
    language: input.language,
    tags: input.tags,
    sedeId: input.sedeId,
    externalCustomerId: null,
    metadata: null,
    piiDeletionRequested: false,
    piiRetentionUntil: null,
    lastSyncedAt: new Date(NOW),
    createdAt: new Date(NOW),
  };
}

export const MOCK_SEDES: Pick<Sede, "id" | "nombre">[] = [
  { id: "seed-koh-tao", nombre: "Koh Tao" },
  { id: "seed-koh-phi-phi", nombre: "Koh Phi Phi" },
  { id: "seed-gili-trawangan", nombre: "Gili Trawangan" },
  { id: "seed-gili-air", nombre: "Gili Air" },
  { id: "seed-nusa-penida", nombre: "Nusa Penida" },
];

const NOW = Date.now();
const m = (h: number) => new Date(NOW - h * 60 * 60 * 1000);

const MOCK_CONVERSATIONS: ConversationRow[] = [
  {
    conv: {
      id: "mock-c-001",
      respondIoConversationId: "rio-001",
      respondIoContactId: "rio-contact-001",
      sedeId: "seed-gili-trawangan",
      status: "active",
      leadStage: "deposit_pending",
      origin: "production",
      leadStageChangedAt: m(8),
      leadMetadata: {
        ref_code: "DPM-A7B3K2",
        deposit_amount: 40,
        deposit_currency: "EUR",
        requires_human_verification: true,
        history: [
          { from: "new", to: "qualified", at: m(20).toISOString(), by: "ai" },
          { from: "qualified", to: "proposed", at: m(15).toISOString(), by: "ai" },
          {
            from: "proposed",
            to: "deposit_pending",
            at: m(8).toISOString(),
            by: "ai",
            note: "solicitar_deposito DPM-A7B3K2 EUR",
          },
        ],
      } satisfies LeadMetadata,
      assignedAgent: null,
      followUpState: null,
      closedAt: null,
      createdAt: m(20),
      updatedAt: m(8),
    },
    contact: mockContact({
      respondIoContactId: "rio-contact-001",
      phone: "+34 612 000 001",
      name: "Ana López",
      language: "es",
      tags: ["sede:gili_trawangan"],
      sedeId: "seed-gili-trawangan",
    }),
    sedeName: "Gili Trawangan",
  },
  {
    conv: {
      id: "mock-c-002",
      respondIoConversationId: "rio-002",
      respondIoContactId: "rio-contact-002",
      sedeId: "seed-koh-tao",
      status: "active",
      leadStage: "proposed",
      origin: "production",
      leadStageChangedAt: m(2),
      leadMetadata: {
        history: [
          { from: "new", to: "qualified", at: m(4).toISOString(), by: "ai" },
          { from: "qualified", to: "proposed", at: m(2).toISOString(), by: "ai" },
        ],
      } satisfies LeadMetadata,
      assignedAgent: null,
      followUpState: null,
      closedAt: null,
      createdAt: m(5),
      updatedAt: m(2),
    },
    contact: mockContact({
      respondIoContactId: "rio-contact-002",
      phone: "+44 7700 900002",
      name: "James Carter",
      language: "en",
      tags: ["sede:koh_tao"],
      sedeId: "seed-koh-tao",
    }),
    sedeName: "Koh Tao",
  },
  {
    conv: {
      id: "mock-c-003",
      respondIoConversationId: "rio-003",
      respondIoContactId: "rio-contact-003",
      sedeId: "seed-gili-trawangan",
      status: "active",
      leadStage: "handed_off",
      origin: "production",
      leadStageChangedAt: m(1),
      leadMetadata: {
        ref_code: "DPM-X2K9PQ",
        deposit_amount: 40,
        deposit_currency: "USD",
        history: [
          { from: "deposit_pending", to: "deposit_paid", at: m(1).toISOString(), by: "human" },
          { from: "deposit_paid", to: "handed_off", at: m(1).toISOString(), by: "human" },
        ],
      } satisfies LeadMetadata,
      assignedAgent: "Patrick",
      followUpState: null,
      closedAt: null,
      createdAt: m(36),
      updatedAt: m(1),
    },
    contact: mockContact({
      respondIoContactId: "rio-contact-003",
      phone: "+1 415 555 0103",
      name: "Sofía García",
      language: "es",
      tags: ["sede:gili_trawangan"],
      sedeId: "seed-gili-trawangan",
    }),
    sedeName: "Gili Trawangan",
  },
  {
    conv: {
      id: "mock-c-004",
      respondIoConversationId: "rio-004",
      respondIoContactId: "rio-contact-004",
      sedeId: "seed-nusa-penida",
      status: "active",
      leadStage: "new",
      origin: "production",
      leadStageChangedAt: m(0.3),
      leadMetadata: { history: [] } satisfies LeadMetadata,
      assignedAgent: null,
      followUpState: null,
      closedAt: null,
      createdAt: m(0.3),
      updatedAt: m(0.3),
    },
    contact: mockContact({
      respondIoContactId: "rio-contact-004",
      phone: "+39 320 000 0004",
      name: "Marco Bianchi",
      language: "it",
      tags: ["sede:nusa_penida"],
      sedeId: "seed-nusa-penida",
    }),
    sedeName: "Nusa Penida",
  },
  {
    conv: {
      id: "mock-c-005",
      respondIoConversationId: "rio-005",
      respondIoContactId: "rio-contact-005",
      sedeId: "seed-gili-air",
      status: "follow_up_disabled",
      leadStage: "lost",
      origin: "production",
      leadStageChangedAt: m(72),
      leadMetadata: {
        history: [
          { from: "qualified", to: "lost", at: m(72).toISOString(), by: "negative_intent", note: "explicit_decline" },
        ],
      } satisfies LeadMetadata,
      assignedAgent: null,
      followUpState: null,
      closedAt: m(72),
      createdAt: m(120),
      updatedAt: m(72),
    },
    contact: mockContact({
      respondIoContactId: "rio-contact-005",
      phone: "+33 612 345 678",
      name: "Élise Dubois",
      language: "fr",
      tags: ["sede:gili_air"],
      sedeId: "seed-gili-air",
    }),
    sedeName: "Gili Air",
  },
];

export function mockListConversations() {
  return MOCK_CONVERSATIONS;
}

export function mockListDepositPending() {
  return MOCK_CONVERSATIONS.filter((r) => r.conv.leadStage === "deposit_pending");
}

export function mockGetConversation(id: string) {
  const row = MOCK_CONVERSATIONS.find((r) => r.conv.id === id);
  if (!row) return null;
  const messages: Mensaje[] =
    row.conv.id === "mock-c-001"
      ? [
          {
            id: "msg-1a",
            conversacionId: row.conv.id,
            sender: "cliente",
            agenteName: null,
            content: "Hola, quería info para hacer Open Water en mayo",
            fuentes: null,
            metadata: null,
            origin: "production",
            createdAt: m(20),
          },
          {
            id: "msg-1b",
            conversacionId: row.conv.id,
            sender: "ai",
            agenteName: null,
            content:
              "¡Hola Ana! Genial, en mayo tenemos cupos para OW de 4 días. ¿En qué fechas exactas viajás?",
            fuentes: ["kb:ow-course", "kb:may-availability"],
            metadata: { model: "claude-sonnet-4-6" },
            origin: "production",
            createdAt: m(19.95),
          },
          {
            id: "msg-1c",
            conversacionId: row.conv.id,
            sender: "cliente",
            agenteName: null,
            content: "Llego el 10 y me quedo 6 días",
            fuentes: null,
            metadata: null,
            origin: "production",
            createdAt: m(15.5),
          },
          {
            id: "msg-1d",
            conversacionId: row.conv.id,
            sender: "ai",
            agenteName: null,
            content:
              "Perfecto. Te propongo OW del 11 al 14 (4 días, post 24h descanso de vuelo). Hay 2 plazas en la franja AM. ¿Te lo reservo?",
            fuentes: ["tool:consultar_disponibilidad", "kb:ow-course", "kb:padi-flight-rule"],
            metadata: { model: "claude-sonnet-4-6" },
            origin: "production",
            createdAt: m(15.4),
          },
          {
            id: "msg-1e",
            conversacionId: row.conv.id,
            sender: "cliente",
            agenteName: null,
            content: "Sí dale, lo reservo",
            fuentes: null,
            metadata: null,
            origin: "production",
            createdAt: m(8.1),
          },
          {
            id: "msg-1f",
            conversacionId: row.conv.id,
            sender: "ai",
            agenteName: null,
            content:
              "Para confirmar tu reserva, envía el depósito de 40 EUR (no reembolsable, se descuenta del total) usando una de estas opciones:\n• Wise / Revolut / banco indonesio\nIMPORTANTE: incluí el código DPM-A7B3K2 en el concepto de la transferencia.",
            fuentes: ["tool:solicitar_deposito", "kb:deposit-policy"],
            metadata: { model: "claude-sonnet-4-6" },
            origin: "production",
            createdAt: m(8),
          },
        ]
      : [];
  return { ...row, messages };
}

export function mockGetDashboardSnapshot() {
  return {
    range: { since: m(24), untilNow: new Date() },
    latency: {
      total: 47,
      p50: 1320,
      p95: 2850,
      p99: 3920,
      cacheHit: 0.78,
      totalCost: 2.41,
      successes: 46,
      errorsCount: 1,
    },
    errors: [
      {
        id: "mock-err-001",
        source: "respond_io",
        conversacionId: "mock-c-005",
        errorType: "send_message_failed",
        errorMessage: "respond_io 401: api key expired (mock)",
        stackTrace: null,
        context: null,
        resolved: false,
        createdAt: m(3),
      },
    ],
    conversations: { total: 5, activeNow: 4 },
  };
}

export function mockListPrompts() {
  return [
    {
      id: "mock-prompt-001",
      versionNumber: 1,
      type: "system",
      sedeId: null,
      content: "(seed v0.1 placeholder — Patrick / Giovanni style)",
      active: true,
      createdBy: "system_seed",
      regressionSuitePassed: false,
      regressionReportId: null,
      createdAt: m(72),
    },
  ];
}

export function mockListFollowUps() {
  return [
    {
      id: "mock-fu-001",
      conversacionId: "mock-c-005",
      level: 3,
      scheduledAt: m(-2),
      sentAt: null,
      cancelledAt: null,
      cancellationReason: null,
      messageSent: null,
      clientResponded: false,
      resultedInSale: null,
      saleAmountUsd: null,
      createdAt: m(2),
    },
  ];
}

export function mockGetFollowUpMetrics() {
  return {
    pending: 1,
    sent: 12,
    cancelled: 3,
    responded: 5,
    sales: 2,
    recoveredUsd: 480,
  };
}

export function mockListRegressionRuns(): unknown[] {
  return [];
}

export function mockGetRegressionRunDetail() {
  return { run: null, cases: [] };
}

export function isMockMode(): boolean {
  return (
    process.env.NODE_ENV !== "production" && process.env.DEV_MOCK_DATA === "1"
  );
}
