import type { Metadata } from "next";
import { LinkList } from "@shared/layout/LinkList";

export const metadata: Metadata = { title: "Viajes" };

const ITEMS = [
    { href: "/como-llego", title: "Cómo llego", text: "De dónde estás a dónde vas: qué línea tomar y cuándo salir." },
    { href: "/recorrido", title: "Recorridos", text: "El trayecto de cada línea en el mapa, con sus paradas." },
    { href: "/paradas-cerca", title: "Paradas cerca mío", text: "Las paradas a pocas cuadras y qué líneas pasan." },
];

export default function Page() {
    return (
        <main className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-4 py-4 pb-[calc(var(--bottom-nav-h)+16px)]">
            <h1 className="text-[22px] font-bold">Viajes</h1>
            <LinkList items={ITEMS} />
        </main>
    );
}
