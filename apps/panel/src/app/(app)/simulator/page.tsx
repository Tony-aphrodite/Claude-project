import { PageHeader } from "~/app/_components/page-header";
import { requireAdminContext } from "~/lib/auth-context";

import { SimulatorClient } from "./simulator-client";

export const dynamic = "force-dynamic";

export default async function SimulatorPage() {
  // Admin-only: the simulator is a development / QA tool (it can chat as
  // any persona against any sede with the real prompt + tool stubs). Office
  // users get a 404 — they have no operational need to run ad-hoc AI
  // simulations in prod.
  await requireAdminContext();

  return (
    <>
      <PageHeader
        eyebrow="Espía interactivo"
        title="Simulador de conversaciones"
        description="Chateá con John como si fueras un cliente — sin tocar WhatsApp ni Respond.io. Las herramientas están stubeadas y la conversación no entra en métricas."
      />
      <SimulatorClient lockedSedeId={null} lockedSedeName={null} />
    </>
  );
}
