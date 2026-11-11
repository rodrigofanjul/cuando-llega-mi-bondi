import type { Arribo } from "@features/arrivals/types";
import { freshnessOf, projectEtaMinutes } from "@features/arrivals/lib/freshness";
import { normalizeArribo } from "@features/arrivals/lib/normalize";

import { DEFAULT_ADVISOR, recommend, stabilize, type Recommendation } from "./advisor";

export interface AdviceInput {
    arribos: Arribo[];
    stopId: string;
    lineCode: string;
    walkMin: number;
    marginMin: number;
    fetchedAt: number;
    now: number;
    /** El proxy marcó STALE: no se recomienda nada. */
    stale: boolean;
}

export type Advice = Recommendation | { kind: "stale-data" };

/** Recomendación de salida a partir de los arribos ya consultados (sin requests extra). */
export function adviseFromArrivals(input: AdviceInput, prev: Recommendation | null): Advice {
    if (input.stale || freshnessOf(input.fetchedAt, input.now) === "stale") return { kind: "stale-data" };
    const buses = input.arribos
        .map((a) => normalizeArribo(a, { stopId: input.stopId, lineCode: input.lineCode, fetchedAt: input.fetchedAt }))
        .map((n) => ({ eta: projectEtaMinutes(n.etaMinutes, input.fetchedAt, input.now), vehicleId: n.vehicleId }))
        .filter((b): b is { eta: number; vehicleId: string | null } => b.eta !== null)
        .map((b) => ({ etaMinutes: b.eta, vehicleId: b.vehicleId }));
    const next = recommend(buses, input.walkMin, input.now, { ...DEFAULT_ADVISOR, safetyMarginMin: input.marginMin });
    return stabilize(prev, next, input.now);
}

/** Coordenadas de la parada informadas por la API (para estimar caminata con ubicación). */
export function stopCoordinates(arribos: Arribo[]): { lat: number; lng: number } | null {
    for (const a of arribos) {
        const lat = Number(a.LatitudParada);
        const lng = Number(a.LongitudParada);
        if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) return { lat, lng };
    }
    return null;
}
