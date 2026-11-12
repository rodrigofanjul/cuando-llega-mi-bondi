/**
 * Marca de la app: ÚNICA fuente de nombre, dominio y colores. Cambiar el nombre
 * = editar este archivo y correr `node scripts/apply-brand.mjs` (nativos).
 * Nombre provisorio hasta que el dueño elija uno (spec 2026-11-12).
 */
export const BRAND = {
    name: "Cuándo Viene",
    shortName: "Cuándo Viene",
    /** Identificador técnico sin espacios ni tildes (paquetes, archivos). */
    slug: "cuando-viene",
    domain: "localhost",
    appUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000",
    accentColor: "#1f6feb",
    backgroundLight: "#f7f7f4",
    backgroundDark: "#0f172a",
    contactEmail: "",
    city: "Mar del Plata",
    description: "Cuándo llega tu colectivo en Mar del Plata, al instante.",
    originalProjectCredit:
        "Basada en el proyecto de código abierto «Cuándo llega mi bondi» (licencia MIT, © 2026 Celiz & Contributors).",
} as const;

export function brandTitle(page?: string): string {
    return page ? `${page} | ${BRAND.name}` : BRAND.name;
}
