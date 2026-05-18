import { PageHeader } from "~/app/_components/page-header";
import { requireUserContext } from "~/lib/auth-context";

import { SimulatorClient } from "./simulator-client";

export const dynamic = "force-dynamic";

export default async function SimulatorPage() {
  const user = await requireUserContext();
  // Office users can only simulate against their own sede — pass it
  // through so the client locks the selector. Admins get the unrestricted
  // dropdown.
  const lockedSedeId =
    user.role === "office" ? user.sedeId ?? null : null;
  const lockedSedeName =
    user.role === "office" ? user.sedeName ?? null : null;

  return (
    <>
      <PageHeader
        eyebrow="Espía interactivo"
        title="Simulador de conversaciones"
        description="Chateá con John como si fueras un cliente — sin tocar WhatsApp ni Respond.io. Las herramientas están stubeadas y la conversación no entra en métricas."
      />
      <SimulatorClient
        lockedSedeId={lockedSedeId}
        lockedSedeName={lockedSedeName}
      />
    </>
  );
}
