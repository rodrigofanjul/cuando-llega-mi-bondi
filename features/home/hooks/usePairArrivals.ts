"use client";

import { useState } from "react";
import useSWR from "swr";

import type { Arribo } from "@features/arrivals/types";
import { normalizeArribo, type NormalizedArrival } from "@features/arrivals/lib/normalize";
import { swrFetcherWithMeta, type MgpResult, type SwrActionKey } from "@shared/api/client";

type Result = MgpResult<{ arribos?: Arribo[] }>;

export interface PairArrivals {
    arrivals: NormalizedArrival[];
    fetchedAt: number | null;
    error: boolean;
    loading: boolean;
}

/** Arribos en vivo de un par (parada, línea) para las tarjetas de Inicio. Mismo polling que el panel (25 s). */
export function usePairArrivals(stopId: string, lineCode: string): PairArrivals {
    const [fetchedAt, setFetchedAt] = useState<number | null>(null);
    const { data, error, isLoading } = useSWR<Result>(
        ["RecuperarProximosArribosW", { identificadorParada: stopId, codigoLineaParada: lineCode }],
        swrFetcherWithMeta as (key: SwrActionKey) => Promise<Result>,
        { refreshInterval: 25_000, refreshWhenHidden: false, revalidateOnFocus: true, onSuccess: () => setFetchedAt(Date.now()) },
    );
    const raw = data?.data?.arribos ?? [];
    const at = fetchedAt ?? 0;
    const arrivals = raw
        .map((a) => normalizeArribo(a, { stopId, lineCode, fetchedAt: at }))
        .filter((a) => a.etaMinutes !== null || a.status === "arriving")
        .sort((a, b) => (a.etaMinutes ?? 0) - (b.etaMinutes ?? 0));
    return { arrivals, fetchedAt, error: Boolean(error), loading: isLoading };
}
