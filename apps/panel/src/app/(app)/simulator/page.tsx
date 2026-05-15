import { PageHeader } from "~/app/_components/page-header";
import { SimulatorClient } from "./simulator-client";

export const dynamic = "force-dynamic";

export default function SimulatorPage() {
  return (
    <>
      <PageHeader
        eyebrow="Espía interactivo"
        title="Simulador de conversaciones"
        description="Chateá con John como si fueras un cliente — sin tocar WhatsApp ni Respond.io. Las herramientas están stubeadas y la conversación no entra en métricas."
      />
      <SimulatorClient />
    </>
  );
}
