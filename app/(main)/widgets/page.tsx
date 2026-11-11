import { WidgetsClient } from "@features/widgets/components/WidgetsClient";

// Misma convención que /favoritos: pantalla personal en LocalStorage.
// TODO: Cache Components adoption (ver app/(main)/favoritos/page.tsx).
export const instant = false;

export const metadata = {
    title: "Widgets",
    description: "Configurá widgets de pantalla de inicio con tus líneas y paradas.",
    robots: { index: false, follow: true },
};

export default function Page() {
    return <WidgetsClient />;
}
