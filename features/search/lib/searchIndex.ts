import type { ParadaGeo } from "@features/trip-planner/types";

export const SEARCH_INDEX_VERSION = 1 as const;

/** [codigoLineaParada, número visible] */
export type IndexLine = [string, string];

export interface IndexStop {
    id: string;
    street: string;
    cross: string;
    lat: number;
    lng: number;
    flag: string | null;
    lines: IndexLine[];
}

export interface SearchIndex {
    v: typeof SEARCH_INDEX_VERSION;
    generatedAt: string;
    lines: IndexLine[];
    stops: IndexStop[];
}

const cleanStreet = (s: string) => s.replace(/\s*-\s*MAR DEL PLATA\s*$/i, "").trim();
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function buildSearchIndex(paradas: ParadaGeo[], generatedAt: string): SearchIndex {
    const lines = new Map<string, string>();
    const stops: IndexStop[] = [];
    for (const p of paradas) {
        if (!p.calleLabel || !p.interseccionLabel || p.lineas.length === 0) continue;
        const ls: IndexLine[] = p.lineas.map((l) => [l.codigoLineaParada, l.descripcion]);
        for (const [code, label] of ls) lines.set(code, label);
        stops.push({
            id: p.identificador,
            street: cleanStreet(p.calleLabel),
            cross: cleanStreet(p.interseccionLabel),
            lat: round5(p.lat),
            lng: round5(p.lng),
            flag: p.abreviaturaBandera,
            lines: ls,
        });
    }
    const sorted = [...lines.entries()].sort((a, b) => a[1].localeCompare(b[1], "es", { numeric: true })) as IndexLine[];
    return { v: SEARCH_INDEX_VERSION, generatedAt, lines: sorted, stops };
}
