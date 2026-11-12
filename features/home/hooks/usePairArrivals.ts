"use client";

import useSWR from "swr";

import type { Arribo } from "@features/arrivals/types";
import { normalizeArribo, type NormalizedArrival } from "@features/arrivals/lib/normalize";
import { swrFetcherWithMeta, type MgpResult, type SwrActionKey } from "@shared/api/client";

// Superconjunto de lo que usa useArribos con la misma clave: el sello de hora no lo afecta.
type Result = MgpResult<{ arribos?: Arribo[] }> & { fetchedAt?: number };

export interface PairArrivals {
    arrivals: NormalizedArrival[];
    /** Hora de la consulta; null si los datos los trajo otro hook (panel) sin sello: usar `now`. */
    fetchedAt: number | null;
    /** Ya hay datos (propios o de otro hook con la misma clave). */
    loaded: boolean;
    /** Los datos vienen de una copia vieja: no mostrarlos como en vivo. */
    stale: boolean;
    error: boolean;
    loading: boolean;
}

const fetcher = async (key: SwrActionKey): Promise<Result> => ({
    ...((await swrFetcherWithMeta(key)) as Result),
    fetchedAt: Date.now(),
});

/**
 * Arribos en vivo de un par (parada, línea) para las tarjetas de Inicio.
 * `live`: consulta cada 25 s (igual que el panel); si no, una sola vez, para acotar el tráfico.
 */
export function usePairArrivals(stopId: string, lineCode: string, live = true): PairArrivals {
    const { data, error, isLoading } = useSWR<Result>(
        ["RecuperarProximosArribosW", { identificadorParada: stopId, codigoLineaParada: lineCode }],
        fetcher,
        { refreshInterval: live ? 25_000 : 0, refreshWhenHidden: false, revalidateOnFocus: live },
    );
    const raw = data?.data?.arribos ?? [];
    const fetchedAt = data?.fetchedAt ?? null;
    const arrivals = raw
        .map((a) => normalizeArribo(a, { stopId, lineCode, fetchedAt: fetchedAt ?? 0 }))
        .filter((a) => a.etaMinutes !== null || a.status === "arriving")
        .sort((a, b) => (a.etaMinutes ?? 0) - (b.etaMinutes ?? 0));
    return { arrivals, fetchedAt, loaded: data !== undefined, stale: data?.meta?.cache === "STALE", error: Boolean(error), loading: isLoading };
}
