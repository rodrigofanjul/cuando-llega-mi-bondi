/**
 * Inferencia de llegadas a partir de observaciones de ETA. NO es verdad
 * absoluta: cada llegada lleva método y confianza, y el entrenamiento/
 * evaluación debe poder filtrar por confianza (prompt §6.2).
 *
 * Métodos:
 * - `arriving_status`: la API informó «Arribando» para esa unidad → alta
 *   confianza si antes se la vio acercándose (ETA ≤ 5), media si no.
 * - `eta_countdown_then_gone`: última vista con ETA ≤ 2 y en la siguiente
 *   consulta (≤ 5 min después) la unidad ya no figura → media.
 * - `eta_countdown_only`: última vista con ETA ≤ 2 sin consulta posterior → baja.
 *
 * Unidades sin identificador no se pueden seguir: se excluyen (y se cuentan).
 */
import type { Observation } from "./observations";

export const INFER_ALGORITHM_VERSION = "infer-v1";

export interface InferredArrival {
    stopId: string;
    lineCode: string;
    vehicleId: string;
    arrivedAt: number;
    method: "arriving_status" | "eta_countdown_then_gone" | "eta_countdown_only";
    confidence: "high" | "medium" | "low";
    lastOfficialEtaMinutes: number | null;
    lastOfficialEtaAt: number | null;
}

const NEAR_MIN = 2;
const APPROACH_MIN = 5;
const GONE_WINDOW_MS = 5 * 60_000;
/** Si una unidad desaparece más de esto, la próxima aparición es otro viaje. */
const TRIP_GAP_MS = 20 * 60_000;

export interface InferenceResult {
    arrivals: InferredArrival[];
    untrackedObservations: number;
}

/** Observaciones de una sola (parada, línea); el orden de entrada no importa. */
export function inferArrivals(observations: Observation[]): InferenceResult {
    const sorted = [...observations].sort((a, b) => a.observedAt - b.observedAt);
    const snapshotTimes = [...new Set(sorted.map((o) => o.observedAt))];
    const byVehicle = new Map<string, Observation[]>();
    let untracked = 0;
    for (const o of sorted) {
        if (!o.vehicleId) {
            untracked++;
            continue;
        }
        const list = byVehicle.get(o.vehicleId) ?? [];
        list.push(o);
        byVehicle.set(o.vehicleId, list);
    }

    const arrivals: InferredArrival[] = [];
    for (const [vehicleId, series] of byVehicle) {
        for (const trip of splitTrips(series)) {
            const inferred = inferTrip(vehicleId, trip, snapshotTimes);
            if (inferred) arrivals.push(inferred);
        }
    }
    arrivals.sort((a, b) => a.arrivedAt - b.arrivedAt);
    return { arrivals, untrackedObservations: untracked };
}

function splitTrips(series: Observation[]): Observation[][] {
    const trips: Observation[][] = [];
    let current: Observation[] = [];
    for (const o of series) {
        const prev = current.at(-1);
        // Nuevo viaje: hueco largo, o el ETA vuelve a subir mucho después de haber llegado.
        const reset =
            prev !== undefined &&
            (o.observedAt - prev.observedAt > TRIP_GAP_MS ||
                (prev.etaStatus === "arriving" && o.etaStatus === "minutes" && (o.etaMinutes ?? 0) > APPROACH_MIN));
        if (reset) {
            trips.push(current);
            current = [];
        }
        current.push(o);
    }
    if (current.length) trips.push(current);
    return trips;
}

function lastEta(trip: Observation[], before: number): { minutes: number; at: number } | null {
    for (let i = trip.length - 1; i >= 0; i--) {
        const o = trip[i];
        if (o.observedAt < before && o.etaStatus === "minutes" && o.etaMinutes !== null) {
            return { minutes: o.etaMinutes, at: o.observedAt };
        }
    }
    return null;
}

function inferTrip(vehicleId: string, trip: Observation[], snapshotTimes: number[]): InferredArrival | null {
    const base = { stopId: trip[0].stopId, lineCode: trip[0].lineCode, vehicleId };

    const arriving = trip.find((o) => o.etaStatus === "arriving");
    if (arriving) {
        const prev = lastEta(trip, arriving.observedAt);
        return {
            ...base,
            arrivedAt: arriving.observedAt,
            method: "arriving_status",
            confidence: prev !== null && prev.minutes <= APPROACH_MIN ? "high" : "medium",
            lastOfficialEtaMinutes: prev?.minutes ?? null,
            lastOfficialEtaAt: prev?.at ?? null,
        };
    }

    const last = trip.at(-1)!;
    if (last.etaMinutes === null || last.etaMinutes > NEAR_MIN) return null;
    const arrivedAt = last.observedAt + last.etaMinutes * 60_000;
    const nextSnapshot = snapshotTimes.find((t) => t > last.observedAt);
    const gone = nextSnapshot !== undefined && nextSnapshot - last.observedAt <= GONE_WINDOW_MS;
    return {
        ...base,
        arrivedAt,
        method: gone ? "eta_countdown_then_gone" : "eta_countdown_only",
        confidence: gone ? "medium" : "low",
        lastOfficialEtaMinutes: last.etaMinutes,
        lastOfficialEtaAt: last.observedAt,
    };
}
