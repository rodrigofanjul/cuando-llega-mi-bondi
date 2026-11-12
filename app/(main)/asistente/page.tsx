import { AssistantClient } from "@features/assistant/components/AssistantClient";

export const instant = false;

export const metadata = {
    title: "Asistente",
    description: "Preguntá cuándo llega tu colectivo, qué línea te conviene o cómo llegar, con datos de la app.",
    robots: { index: false, follow: true },
};

export default function Page() {
    return <AssistantClient />;
}
