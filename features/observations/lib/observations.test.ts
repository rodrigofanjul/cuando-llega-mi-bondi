import { describe, expect, it } from "vitest";

import type { NormalizedArrival } from "@features/arrivals/lib/normalize";
import type { QuerySnapshot } from "@features/widgets/lib/rows";

import { inferArrivals } from "./inferArrivals";
import { ObservationSampler, observationBatchSchema, snapshotToObservations, toDbRow, type Observation } from "./observations";

const MIN = 60_000;
const T0 = Date.parse("2026-11-11T11:00:00Z");

function arrival(eta: number | null, vehicleId: string | null, status: NormalizedArrival["status"] = "minutes"): NormalizedArrival {
    return {
        stopId: "P1",
        lineCode: "531",
        rawLineCode: "531011",
        lineLabel: "531",
        destination: "A CENTRO",
        rawEta: eta === null ? "" : `${eta} min. aprox.`,
        etaMinutes: eta,
        status,
        deviationMinutes: 1,
        vehicleId,
        accessible: false,
        vehiclePosition: { lat: -38, lng: -57.5 },
        gpsAt: T0 - 30_000,
        fetchedAt: T0,
        errorMessage: null,
    };
}

function obs(at: number, vehicleId: string | null, eta: number | null, status: Observation["etaStatus"] = "minutes"): Observation {
    return {
        observedAt: at,
        stopId: "P1",
        lineCode: "531",
        rawLineCode: null,
        destination: null,
        vehicleId,
        etaMinutes: eta,
        etaStatus: status,
        rawEta: null,
        deviationMinutes: null,
        gpsAt: null,
        origin: "user_query",
    };
}

describe("snapshotToObservations", () => {
    it("convierte sin datos personales ni posición del vehículo", () => {
        const snap: QuerySnapshot = { stopId: "P1", lineCode: "531", fetchedAt: T0, error: null, arrivals: [arrival(7, "C1")] };
        const [o] = snapshotToObservations(snap, "user_query");
        expect(o).toEqual({
            observedAt: T0,
            stopId: "P1",
            lineCode: "531",
            rawLineCode: "531011",
            destination: "A CENTRO",
            vehicleId: "C1",
            etaMinutes: 7,
            etaStatus: "minutes",
            rawEta: "7 min. aprox.",
            deviationMinutes: 1,
            gpsAt: T0 - 30_000,
            origin: "user_query",
        });
        expect(observationBatchSchema.safeParse({ observations: [o] }).success).toBe(true);
        expect(toDbRow(o, "0.1.0")).toMatchObject({ observed_at: "2026-11-11T11:00:00.000Z", eta_status: "minutes", app_version: "0.1.0" });
    });

    it("snapshots con error no generan observaciones", () => {
        expect(snapshotToObservations({ stopId: "P1", lineCode: "531", fetchedAt: T0, error: "Sin conexión", arrivals: [] }, "widget")).toEqual([]);
    });
});

describe("ObservationSampler", () => {
    it("una observación por par cada minuto", () => {
        const s = new ObservationSampler();
        expect(s.accept("P1", "531", T0)).toBe(true);
        expect(s.accept("P1", "531", T0 + 25_000)).toBe(false);
        expect(s.accept("P2", "531", T0 + 25_000)).toBe(true);
        expect(s.accept("P1", "531", T0 + MIN)).toBe(true);
    });
});

describe("observationBatchSchema", () => {
    it("rechaza lotes vacíos, grandes o con campos inválidos", () => {
        expect(observationBatchSchema.safeParse({ observations: [] }).success).toBe(false);
        expect(observationBatchSchema.safeParse({ observations: Array(51).fill(obs(T0, "C1", 5)) }).success).toBe(false);
        expect(observationBatchSchema.safeParse({ observations: [{ ...obs(T0, "C1", 5), origin: "scraper" }] }).success).toBe(false);
    });
});

describe("inferArrivals", () => {
    it("«Arribando» después de verlo acercarse → confianza alta", () => {
        const r = inferArrivals([obs(T0, "C1", 6), obs(T0 + 2 * MIN, "C1", 4), obs(T0 + 5 * MIN, "C1", 0, "arriving")]);
        expect(r.arrivals).toEqual([
            {
                stopId: "P1",
                lineCode: "531",
                vehicleId: "C1",
                arrivedAt: T0 + 5 * MIN,
                method: "arriving_status",
                confidence: "high",
                lastOfficialEtaMinutes: 4,
                lastOfficialEtaAt: T0 + 2 * MIN,
            },
        ]);
    });

    it("«Arribando» sin historia previa → media", () => {
        expect(inferArrivals([obs(T0, "C1", 0, "arriving")]).arrivals[0].confidence).toBe("medium");
    });

    it("ETA ≤ 2 y desaparece en la consulta siguiente → media; sin consulta siguiente → baja", () => {
        const gone = inferArrivals([obs(T0, "C1", 2), obs(T0 + 3 * MIN, "C2", 15)]);
        expect(gone.arrivals.find((a) => a.vehicleId === "C1")).toMatchObject({
            method: "eta_countdown_then_gone",
            confidence: "medium",
            arrivedAt: T0 + 2 * MIN,
        });
        const only = inferArrivals([obs(T0, "C1", 1)]);
        expect(only.arrivals[0]).toMatchObject({ method: "eta_countdown_only", confidence: "low" });
    });

    it("no infiere llegada si el último ETA era lejano, y excluye unidades sin id", () => {
        const r = inferArrivals([obs(T0, "C1", 12), obs(T0, null, 3)]);
        expect(r.arrivals).toEqual([]);
        expect(r.untrackedObservations).toBe(1);
    });

    it("separa viajes distintos de la misma unidad", () => {
        const r = inferArrivals([
            obs(T0, "C1", 3),
            obs(T0 + 2 * MIN, "C1", 0, "arriving"),
            obs(T0 + 70 * MIN, "C1", 4),
            obs(T0 + 73 * MIN, "C1", 0, "arriving"),
        ]);
        expect(r.arrivals.map((a) => a.arrivedAt)).toEqual([T0 + 2 * MIN, T0 + 73 * MIN]);
    });

    it("no depende del orden de entrada", () => {
        const input = [obs(T0 + 5 * MIN, "C1", 0, "arriving"), obs(T0, "C1", 6)];
        expect(inferArrivals(input).arrivals[0].arrivedAt).toBe(T0 + 5 * MIN);
    });
});
