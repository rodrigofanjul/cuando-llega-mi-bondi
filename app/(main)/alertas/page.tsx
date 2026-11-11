import { AlertsClient } from "@features/alerts/components/AlertsClient";

// Pantalla personal en LocalStorage (misma convención que /favoritos y /widgets).
export const instant = false;

export const metadata = {
    title: "Alertas",
    description: "Avisos cuando tu colectivo está cerca, cuándo salir y demoras estimadas.",
    robots: { index: false, follow: true },
};

export default function Page() {
    return <AlertsClient />;
}
