import type { Metadata } from "next";
import { LinkList } from "@shared/layout/LinkList";

export const metadata: Metadata = { title: "Más" };

const ITEMS = [
    { href: "/alertas", title: "Alertas", text: "Avisos cuando tu colectivo está por llegar." },
    { href: "/asistente", title: "Asistente", text: "Preguntá en lenguaje natural." },
    { href: "/widgets", title: "Widgets", text: "Tus paradas en la pantalla de inicio del celular." },
    { href: "/favoritos", title: "Tus paradas", text: "Renombrar, ordenar y sugerencias por horario." },
    { href: "/recorrido", title: "Reseñas de líneas", text: "Opiniones de quienes viajan." },
    { href: "/perfil", title: "Perfil y datos", text: "Pantalla, alto contraste y borrar datos de este dispositivo." },
    { href: "/acerca", title: "Acerca de", text: "Quiénes somos, privacidad y términos." },
];

export default function Page() {
    return (
        <main className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-4 py-4 pb-[calc(var(--bottom-nav-h)+16px)]">
            <h1 className="text-[22px] font-bold">Más</h1>
            <LinkList items={ITEMS} />
        </main>
    );
}
