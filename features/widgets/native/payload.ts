/**
 * Payloads web → nativo (contrato v1). Kotlin (`WidgetStore.kt`) y Swift
 * (`WidgetStore.swift`) leen exactamente estas formas.
 */
import type { NormalizedArrival } from "@features/arrivals/lib/normalize";
import type { WidgetConfig } from "@features/widgets/lib/config";
import type { QuerySnapshot } from "@features/widgets/lib/rows";

export const STORE_VERSION = 1 as const;

export interface WidgetStorePayload {
    version: typeof STORE_VERSION;
    /** Base del endpoint de arribos que ya usa la web, p. ej. `https://bondimdp.com.ar/api`. */
    apiBase: string;
    configs: WidgetConfig[];
    savedAt: number;
}

export interface SnapshotArrival {
    lineCode: string;
    destination: string;
    etaMinutes: number | null;
    status: NormalizedArrival["status"];
    vehicleId: string | null;
}

export interface SnapshotPayload {
    version: typeof STORE_VERSION;
    snapshots: {
        stopId: string;
        lineCode: string;
        fetchedAt: number;
        error: string | null;
        arrivals: SnapshotArrival[];
    }[];
}

export function buildStorePayload(configs: WidgetConfig[], apiBase: string, now: number): WidgetStorePayload {
    return { version: STORE_VERSION, apiBase: apiBase.replace(/\/$/, ""), configs, savedAt: now };
}

/** Recorta cada snapshot a lo que el widget necesita (sin posiciones GPS ni ids de chofer). */
export function buildSnapshotPayload(snapshots: QuerySnapshot[]): SnapshotPayload {
    return {
        version: STORE_VERSION,
        snapshots: snapshots.map((s) => ({
            stopId: s.stopId,
            lineCode: s.lineCode,
            fetchedAt: s.fetchedAt,
            error: s.error,
            arrivals: s.arrivals
                .filter((a) => a.stopId === s.stopId && a.lineCode === s.lineCode)
                .slice(0, 6)
                .map((a) => ({
                    lineCode: a.lineCode,
                    destination: a.destination,
                    etaMinutes: a.etaMinutes,
                    status: a.status,
                    vehicleId: a.vehicleId,
                })),
        })),
    };
}
