/**
 * Observaciones crudas de arribos para el histórico (Fase 4) y el motor
 * offline (Fase 9). Sólo se derivan de consultas que la app ya hizo: no se
 * generan requests adicionales al proveedor para recolectar.
 */
import { z } from "zod";

import type { QuerySnapshot } from "@features/widgets/lib/rows";

export const OBSERVATION_ORIGINS = ["user_query", "widget", "alert_runner"] as const;

export const observationSchema = z.object({
    observedAt: z.number().int().positive(),
    stopId: z.string().trim().min(1).max(40),
    lineCode: z.string().trim().min(1).max(40),
    rawLineCode: z.string().max(40).nullable(),
    destination: z.string().max(80).nullable(),
    vehicleId: z.string().max(40).nullable(),
    etaMinutes: z.number().int().min(0).max(600).nullable(),
    etaStatus: z.enum(["arriving", "minutes", "unknown"]),
    rawEta: z.string().max(40).nullable(),
    deviationMinutes: z.number().int().min(-600).max(600).nullable(),
    gpsAt: z.number().int().positive().nullable(),
    origin: z.enum(OBSERVATION_ORIGINS),
});
export type Observation = z.infer<typeof observationSchema>;

export const observationBatchSchema = z.object({
    appVersion: z.string().max(20).optional(),
    observations: z.array(observationSchema).min(1).max(50),
});

export function snapshotToObservations(snap: QuerySnapshot, origin: Observation["origin"]): Observation[] {
    if (snap.error) return [];
    return snap.arrivals
        .filter((a) => a.stopId === snap.stopId && a.lineCode === snap.lineCode)
        .map((a) => ({
            observedAt: snap.fetchedAt,
            stopId: snap.stopId,
            lineCode: snap.lineCode,
            rawLineCode: a.rawLineCode || null,
            destination: a.destination || null,
            vehicleId: a.vehicleId,
            etaMinutes: a.etaMinutes,
            etaStatus: a.status,
            rawEta: a.rawEta.slice(0, 40) || null,
            deviationMinutes: a.deviationMinutes,
            gpsAt: a.gpsAt,
            origin,
        }));
}

/**
 * Muestreo: como máximo una observación por (parada, línea) cada
 * `minIntervalMs`. Evita que un usuario con la pantalla abierta (polling
 * 25 s) domine el histórico y acota el volumen.
 */
export class ObservationSampler {
    private last = new Map<string, number>();

    constructor(private readonly minIntervalMs = 60_000) {}

    accept(stopId: string, lineCode: string, at: number): boolean {
        const key = `${stopId}|${lineCode}`;
        const prev = this.last.get(key);
        if (prev !== undefined && at - prev < this.minIntervalMs) return false;
        this.last.set(key, at);
        return true;
    }
}

/** Fila para Supabase (snake_case, timestamps ISO). */
export function toDbRow(o: Observation, appVersion: string | null) {
    return {
        observed_at: new Date(o.observedAt).toISOString(),
        stop_id: o.stopId,
        line_code: o.lineCode,
        raw_line_code: o.rawLineCode,
        destination: o.destination,
        vehicle_id: o.vehicleId,
        eta_minutes: o.etaMinutes,
        eta_status: o.etaStatus,
        raw_eta: o.rawEta,
        deviation_minutes: o.deviationMinutes,
        gps_at: o.gpsAt === null ? null : new Date(o.gpsAt).toISOString(),
        origin: o.origin,
        app_version: appVersion,
    };
}
