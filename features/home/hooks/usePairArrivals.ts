"use client";

import useSWR from "swr";

import { normalizeArribo, type NormalizedArrival } from "@features/arrivals/lib/normalize";
import { arrivalsFetcher, type ArrivalsResult } from "@features/arrivals/lib/arrivalsFetcher";

export interface PairArrivals {
    arrivals: NormalizedArrival[];
    /** Hora de la consulta propia; null si aún no hay datos con sello (caché de otro hook sin sello cuenta como no cargado). */
    fetchedAt: number | null;
    /** Hay datos con sello de hora (nunca se sustituye por `now`). */
    loaded: boolean;
    /** Los datos vienen de una copia vieja: no mostrarlos como en vivo. */
    stale: boolean;
    error: boolean;
    loading: boolean;
}

/**
 * Arribos en vivo de un par (parada, línea) para las tarjetas de Inicio.
 * `live`: consulta cada 25 s (igual que el panel); si no, una sola vez, para acotar el tráfico.
 */
export function usePairArrivals(stopId: string, lineCode: string, live = true): PairArrivals {
    const { data, error, isLoading } = useSWR<ArrivalsResult>(
        ["RecuperarProximosArribosW", { identificadorParada: stopId, codigoLineaParada: lineCode }],
        arrivalsFetcher,
        { refreshInterval: live ? 25_000 : 0, refreshWhenHidden: false, revalidateOnFocus: live, revalidateOnMount: true },
    );
    const raw = data?.data?.arribos ?? [];
    const fetchedAt = data?.fetchedAt ?? null;
    const arrivals = raw
        .map((a) => normalizeArribo(a, { stopId, lineCode, fetchedAt: fetchedAt ?? 0 }))
        .filter((a) => a.etaMinutes !== null || a.status === "arriving")
        .sort((a, b) => (a.etaMinutes ?? 0) - (b.etaMinutes ?? 0));
    return { arrivals, fetchedAt, loaded: fetchedAt !== null, stale: data?.meta?.cache === "STALE", error: Boolean(error), loading: isLoading };
}
