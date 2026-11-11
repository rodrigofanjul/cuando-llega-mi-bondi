/**
 * Frescura de un dato de arribo. Widgets y alertas nunca muestran un ETA
 * vencido como si fuera actual: si el dato está `stale`, se oculta el número
 * y se muestra la hora de la última actualización.
 */
export type Freshness = "fresh" | "aging" | "stale";

export interface FreshnessThresholds {
    agingMs: number;
    staleMs: number;
}

export const DEFAULT_FRESHNESS: FreshnessThresholds = {
    agingMs: 2 * 60_000,
    staleMs: 10 * 60_000,
};

export function freshnessOf(
    fetchedAt: number,
    now: number,
    thresholds: FreshnessThresholds = DEFAULT_FRESHNESS,
): Freshness {
    const age = Math.max(0, now - fetchedAt);
    if (age >= thresholds.staleMs) return "stale";
    if (age >= thresholds.agingMs) return "aging";
    return "fresh";
}

/**
 * ETA restante estimado a `now` a partir del ETA informado en `fetchedAt`.
 * Redondea hacia abajo (conservador para quien tiene que salir).
 */
export function projectEtaMinutes(
    etaMinutes: number | null,
    fetchedAt: number,
    now: number,
    thresholds: FreshnessThresholds = DEFAULT_FRESHNESS,
): number | null {
    if (etaMinutes === null) return null;
    if (freshnessOf(fetchedAt, now, thresholds) === "stale") return null;
    const elapsedMin = Math.max(0, now - fetchedAt) / 60_000;
    return Math.max(0, Math.floor(etaMinutes - elapsedMin));
}
