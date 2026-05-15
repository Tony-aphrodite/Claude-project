import { PageHeader } from "~/app/_components/page-header";
import { SimulatorClient } from "./simulator-client";

export const dynamic = "force-dynamic";

export default function SimulatorPage() {
  return (
    <>
      <PageHeader
        eyebrow="Espía interactivo"
        title="Simulador de conversaciones"
        description="Chateá con John como si fueras un cliente, sin usar un número de WhatsApp ni contaminar las métricas del dashboard. Las conversaciones del simulador se marcan con origin='simulator' y NO disparan workflows en Respond.io. Las herramientas (consultar_disponibilidad / solicitar_deposito / enviar_catalogo) están stubeadas — devuelven respuestas plausibles para que el flujo no se trabe, sin efectos secundarios reales."
      />
      <SimulatorClient />
    </>
  );
}
