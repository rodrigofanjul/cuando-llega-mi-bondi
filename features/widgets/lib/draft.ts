/**
 * Puente entre el formulario de /widgets y el contrato `WidgetConfig`.
 * Las paradas y líneas se eligen entre los favoritos existentes (no se
 * duplica el flujo de búsqueda); cada favorito ya identifica una parada
 * física y una línea concretas.
 */
import type { Favorito } from "@features/favorites/types";
import { resolveFavoritoLinea } from "@features/favorites/resolveFavoritoLinea";

import { parseWidgetConfigs, type PlaceKind, type WidgetConfig, type WidgetTarget } from "./config";

export type WidgetKind = WidgetConfig["kind"];

export interface SlotDraft {
    place: PlaceKind;
    label: string;
    days: number[];
    from: string;
    to: string;
    favoriteIds: string[];
}

export interface WidgetDraft {
    id: string;
    name: string;
    kind: WidgetKind;
    favoriteIds: string[];
    /** Filtrar por el sentido guardado en el favorito. */
    sameDirection: boolean;
    maxRows: number;
    showSecondArrival: boolean;
    slots: SlotDraft[];
    fallbackFavoriteIds: string[];
}

export const PLACE_LABELS: Record<PlaceKind, string> = {
    home: "Casa",
    work: "Trabajo",
    university: "Universidad",
    other: "Otro lugar",
};

export const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;

export function newDraft(id: string): WidgetDraft {
    return {
        id,
        name: "",
        kind: "single",
        favoriteIds: [],
        sameDirection: false,
        maxRows: 3,
        showSecondArrival: true,
        slots: [],
        fallbackFavoriteIds: [],
    };
}

export function newSlot(place: PlaceKind = "home"): SlotDraft {
    return { place, label: PLACE_LABELS[place], days: [1, 2, 3, 4, 5], from: "07:00", to: "09:00", favoriteIds: [] };
}

export function favoriteToTarget(
    fav: Favorito,
    descripcionToCode: Map<string, string>,
    sameDirection: boolean,
): WidgetTarget | null {
    const lineCode = resolveFavoritoLinea(fav, descripcionToCode);
    if (!lineCode || !fav.identificadorParada) return null;
    const lineLabel = (fav.lineaLabel || fav.descripcionLinea || lineCode).trim();
    const stopLabel =
        [fav.calleLabel, fav.interseccionLabel].filter(Boolean).join(" y ").trim() || fav.nombre.trim() || fav.identificadorParada;
    return {
        stopId: fav.identificadorParada,
        stopLabel: stopLabel.slice(0, 80),
        lineCode,
        lineLabel: lineLabel.slice(0, 80),
        destination: sameDirection ? (fav.descripcionBandera ?? "").trim().slice(0, 80) : "",
    };
}

function targetsFrom(
    ids: string[],
    favoritos: Favorito[],
    map: Map<string, string>,
    sameDirection: boolean,
): { targets: WidgetTarget[]; unresolved: number } {
    const byId = new Map(favoritos.map((f) => [f.id, f]));
    let unresolved = 0;
    const targets: WidgetTarget[] = [];
    for (const id of ids) {
        const fav = byId.get(id);
        const t = fav ? favoriteToTarget(fav, map, sameDirection) : null;
        if (t) targets.push(t);
        else unresolved++;
    }
    return { targets, unresolved };
}

export type DraftResult = { ok: true; config: WidgetConfig } | { ok: false; error: string };

/** Mensajes en castellano para errores frecuentes; el resto, el de zod. */
export function draftToConfig(draft: WidgetDraft, favoritos: Favorito[], map: Map<string, string>): DraftResult {
    const name = draft.name.trim();
    if (!name) return { ok: false, error: "Poné un nombre al widget." };
    const display = { maxRows: draft.maxRows, showSecondArrival: draft.showSecondArrival, predictionSource: "official" as const };
    const base = { version: 1 as const, id: draft.id, name, display };

    let candidate: unknown;
    if (draft.kind === "smart") {
        if (draft.slots.length === 0) return { ok: false, error: "Agregá al menos una franja horaria." };
        const slots = [];
        for (const s of draft.slots) {
            const { targets, unresolved } = targetsFrom(s.favoriteIds, favoritos, map, draft.sameDirection);
            if (unresolved) return { ok: false, error: `Hay favoritos sin línea reconocida en «${s.label}».` };
            if (targets.length === 0) return { ok: false, error: `Elegí al menos una parada para «${s.label}».` };
            if (s.days.length === 0) return { ok: false, error: `Elegí días para «${s.label}».` };
            slots.push({ place: s.place, label: s.label.trim() || PLACE_LABELS[s.place], days: s.days, from: s.from, to: s.to, targets });
        }
        const fallback = targetsFrom(draft.fallbackFavoriteIds, favoritos, map, draft.sameDirection);
        candidate = { ...base, kind: "smart", slots, fallbackTargets: fallback.targets };
    } else {
        const { targets, unresolved } = targetsFrom(draft.favoriteIds, favoritos, map, draft.sameDirection);
        if (unresolved) return { ok: false, error: "Algún favorito no tiene línea reconocida; volvé a guardarlo desde Consultar." };
        if (targets.length === 0) return { ok: false, error: "Elegí al menos una parada favorita." };
        if (draft.kind === "single" && targets.length !== 1) {
            return { ok: false, error: "El widget de una línea muestra un solo favorito." };
        }
        candidate = { ...base, kind: draft.kind, targets };
    }

    const parsed = parseWidgetConfigs([candidate]);
    return parsed.ok ? { ok: true, config: parsed.configs[0] } : { ok: false, error: `Configuración inválida: ${parsed.error}` };
}

/** Reconstruye un borrador desde una configuración guardada (edición). */
export function configToDraft(config: WidgetConfig, favoritos: Favorito[], map: Map<string, string>): WidgetDraft {
    const idsFor = (targets: WidgetTarget[]) =>
        targets
            .map((t) => favoritos.find((f) => f.identificadorParada === t.stopId && resolveFavoritoLinea(f, map) === t.lineCode)?.id)
            .filter((id): id is string => Boolean(id));
    const allTargets = config.kind === "smart" ? config.slots.flatMap((s) => s.targets) : config.targets;
    return {
        id: config.id,
        name: config.name,
        kind: config.kind,
        favoriteIds: config.kind === "smart" ? [] : idsFor(config.targets),
        sameDirection: allTargets.some((t) => t.destination !== ""),
        maxRows: config.display.maxRows,
        showSecondArrival: config.display.showSecondArrival,
        slots:
            config.kind === "smart"
                ? config.slots.map((s) => ({ place: s.place, label: s.label, days: s.days, from: s.from, to: s.to, favoriteIds: idsFor(s.targets) }))
                : [],
        fallbackFavoriteIds: config.kind === "smart" ? idsFor(config.fallbackTargets) : [],
    };
}
