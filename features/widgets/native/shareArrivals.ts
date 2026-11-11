/**
 * Comparte con los widgets nativos los arribos que la app ya obtuvo, para que
 * el widget se actualice sin otra request. Sólo pares (parada, línea) que
 * algún widget necesita; nunca los fixtures de desarrollo.
 */
import type { Arribo } from "@features/arrivals/types";
import { normalizeArribo } from "@features/arrivals/lib/normalize";
import { requiredQueries, type WidgetConfig } from "@features/widgets/lib/config";
import type { QuerySnapshot } from "@features/widgets/lib/rows";

import type { WidgetBridge } from "./bridge";

export function snapshotForWidgets(
    configs: WidgetConfig[],
    stopId: string,
    lineCode: string,
    arribos: Arribo[],
    fetchedAt: number,
): QuerySnapshot | null {
    if (!stopId || !lineCode) return null;
    const needed = requiredQueries(configs).some((q) => q.stopId === stopId && q.lineCode === lineCode);
    if (!needed) return null;
    return {
        stopId,
        lineCode,
        fetchedAt,
        error: null,
        arrivals: arribos.map((a) => normalizeArribo(a, { stopId, lineCode, fetchedAt })),
    };
}

export async function shareArrivalsWithWidgets(
    bridge: Pick<WidgetBridge, "available" | "pushSnapshots">,
    configs: WidgetConfig[],
    stopId: string,
    lineCode: string,
    arribos: Arribo[],
    fetchedAt: number,
): Promise<boolean> {
    if (!bridge.available) return false;
    const snap = snapshotForWidgets(configs, stopId, lineCode, arribos, fetchedAt);
    return snap ? bridge.pushSnapshots([snap]) : false;
}
