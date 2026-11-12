import type { Favorito } from "@features/favorites/types";
import { displayCase as titleCase, normalizeText } from "@features/search/lib/normalize";

export interface CornerGroup {
    key: string;
    title: string;
    favorites: Favorito[];
}

const clean = (s: string) => s.replace(/\s*-\s*MAR DEL PLATA\s*$/i, "").trim();

export function groupByCorner(favoritos: Favorito[]): CornerGroup[] {
    const groups = new Map<string, CornerGroup>();
    for (const f of favoritos) {
        const hasCorner = Boolean(f.calleLabel && f.interseccionLabel);
        const key = hasCorner ? `c:${normalizeText(clean(f.calleLabel!))}|${normalizeText(clean(f.interseccionLabel!))}` : `p:${f.identificadorParada}`;
        const title = hasCorner ? `${titleCase(clean(f.calleLabel!))} y ${titleCase(clean(f.interseccionLabel!))}` : f.nombre;
        const g = groups.get(key);
        if (g) g.favorites.push(f);
        else groups.set(key, { key, title, favorites: [f] });
    }
    return [...groups.values()];
}
