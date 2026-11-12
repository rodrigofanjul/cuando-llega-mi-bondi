import { swrFetcherWithMeta, type MgpResult, type SwrActionKey } from "@shared/api/client";
import type { Arribo } from "@features/arrivals/types";

export type ArrivalsResult = MgpResult<{ arribos?: Arribo[] }> & { fetchedAt?: number };

/**
 * Fetcher único de `RecuperarProximosArribosW`: lo usan el panel y las tarjetas de Inicio
 * con la MISMA key de SWR, así que ambos deben guardar la misma forma (con la hora de la consulta).
 */
export async function arrivalsFetcher(key: SwrActionKey): Promise<ArrivalsResult> {
    return { ...((await swrFetcherWithMeta(key)) as ArrivalsResult), fetchedAt: Date.now() };
}