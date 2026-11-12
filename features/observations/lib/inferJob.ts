/**
 * Job periódico: observaciones crudas guardadas → llegadas inferidas (tabla
 * inferred_arrivals). No consulta al proveedor: sólo lee lo ya recolectado.
 *
 * Ventanas solapadas: cada corrida lee las últimas `READ_HOURS` horas pero sólo
 * guarda llegadas dentro de una zona central [keepFrom, keepTo). Así toda llegada
 * se calcula con contexto completo antes y después, dos corridas producen la
 * misma fila y el UNIQUE de la tabla descarta repetidas.
 */
import { INFER_ALGORITHM_VERSION, inferArrivals, type InferredArrival } from "./inferArrivals";
import type { Observation } from "./observations";

export const READ_HOURS = 3;
/** Margen final: una unidad «desaparece» hasta 5 min después; se deja holgura. */
export const SETTLE_MIN = 30;
/** Margen inicial: el viaje pudo empezar a verse hasta 20 min antes (TRIP_GAP). */
export const LEAD_MIN = 30;

export interface InferWindow {
    readFrom: number;
    keepFrom: number;
    keepTo: number;
}

export function planWindow(now: number): InferWindow {
    return {
        readFrom: now - READ_HOURS * 3_600_000,
        keepFrom: now - READ_HOURS * 3_600_000 + LEAD_MIN * 60_000,
        keepTo: now - SETTLE_MIN * 60_000,
    };
}

/** Fila tal como la devuelve PostgREST (timestamps ISO). */
export interface ObservationDbRow {
    observed_at: string;
    stop_id: string;
    line_code: string;
    vehicle_id: string | null;
    eta_minutes: number | null;
    eta_status: Observation["etaStatus"];
}

export function fromDbRow(r: ObservationDbRow): Observation {
    return {
        observedAt: Date.parse(r.observed_at),
        stopId: r.stop_id,
        lineCode: r.line_code,
        rawLineCode: null,
        destination: null,
        vehicleId: r.vehicle_id,
        etaMinutes: r.eta_minutes,
        etaStatus: r.eta_status,
        rawEta: null,
        deviationMinutes: null,
        gpsAt: null,
        origin: "user_query",
    };
}

export function toInferredRow(a: InferredArrival) {
    return {
        stop_id: a.stopId,
        line_code: a.lineCode,
        vehicle_id: a.vehicleId,
        arrived_at: new Date(a.arrivedAt).toISOString(),
        method: a.method,
        confidence: a.confidence,
        last_official_eta_minutes: a.lastOfficialEtaMinutes,
        last_official_eta_at: a.lastOfficialEtaAt === null ? null : new Date(a.lastOfficialEtaAt).toISOString(),
        algorithm_version: INFER_ALGORITHM_VERSION,
    };
}

export interface BatchResult {
    rows: ReturnType<typeof toInferredRow>[];
    series: number;
    untracked: number;
}

export function inferBatch(rows: ObservationDbRow[], w: InferWindow): BatchResult {
    const bySeries = new Map<string, Observation[]>();
    for (const r of rows) {
        const o = fromDbRow(r);
        if (!Number.isFinite(o.observedAt) || o.observedAt < w.readFrom) continue;
        const key = `${o.stopId}|${o.lineCode}`;
        const list = bySeries.get(key);
        if (list) list.push(o);
        else bySeries.set(key, [o]);
    }
    const out: BatchResult = { rows: [], series: bySeries.size, untracked: 0 };
    for (const list of bySeries.values()) {
        const r = inferArrivals(list);
        out.untracked += r.untrackedObservations;
        for (const a of r.arrivals) {
            if (a.arrivedAt >= w.keepFrom && a.arrivedAt < w.keepTo) out.rows.push(toInferredRow(a));
        }
    }
    return out;
}
