/**
 * Envío de observaciones al servidor propio (/api/observations). Apagado por
 * defecto: requiere `NEXT_PUBLIC_OBSERVATIONS_ENABLED=true` en el cliente y
 * `OBSERVATIONS_INGEST_ENABLED=true` en el servidor (blocker B1). Sólo reutiliza
 * consultas que la app ya hizo; nunca consulta al proveedor para recolectar.
 */
import type { QuerySnapshot } from "@features/widgets/lib/rows";

import { ObservationSampler, snapshotToObservations, type Observation } from "../lib/observations";

export interface ReporterDeps {
    enabled: () => boolean;
    send: (body: string) => Promise<void>;
    sampler: ObservationSampler;
}

export function createObservationReporter(deps: ReporterDeps) {
    return async (snap: QuerySnapshot, origin: Observation["origin"]): Promise<number> => {
        if (!deps.enabled()) return 0;
        if (!deps.sampler.accept(snap.stopId, snap.lineCode, snap.fetchedAt)) return 0;
        const observations = snapshotToObservations(snap, origin).slice(0, 50);
        if (observations.length === 0) return 0;
        await deps.send(JSON.stringify({ appVersion: process.env.NEXT_PUBLIC_APP_VERSION?.slice(0, 20), observations }));
        return observations.length;
    };
}

export const reportObservations = createObservationReporter({
    enabled: () => process.env.NEXT_PUBLIC_OBSERVATIONS_ENABLED === "true",
    sampler: new ObservationSampler(),
    send: async (body) => {
        await fetch("/api/observations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            keepalive: true,
        });
    },
});
