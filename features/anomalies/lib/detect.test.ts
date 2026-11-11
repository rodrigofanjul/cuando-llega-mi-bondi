import { describe, expect, it } from "vitest";

import type { NormalizedArrival } from "@features/arrivals/lib/normalize";
import type { InferredArrival } from "@features/observations/lib/inferArrivals";

import { confirmedDelays, detectAnomalies, mostRelevant, type SeriesPoint } from "./detect";

const MIN = 60_000;
const T0 = Date.parse("2026-11-11T11:00:00Z");

function a(eta: number | null, vehicleId: string | null, extra: Partial<NormalizedArrival> = {}): NormalizedArrival {
    return {
        stopId: "P1",
        lineCode: "531",
        rawLineCode: "531",
        lineLabel: "531",
        destination: "A CENTRO",
        rawEta: "",
        etaMinutes: eta,
        status: eta === 0 ? "arriving" : "minutes",
        deviationMinutes: null,
        vehicleId,
        accessible: false,
        vehiclePosition: null,
        gpsAt: null,
        fetchedAt: 0,
        errorMessage: null,
        ...extra,
    };
}

const point = (minute: number, arrivals: NormalizedArrival[]): SeriesPoint => ({ at: T0 + minute * MIN, arrivals });

describe("detectAnomalies", () => {
    it("sin datos o con pocas consultas → datos insuficientes", () => {
        expect(detectAnomalies([])[0].level).toBe("datos_insuficientes");
        expect(detectAnomalies([point(0, [a(5, "C1")])])[0].kind).toBe("insufficient_data");
    });

    it("desvío oficial → demora estimada (no confirmada)", () => {
        const s = detectAnomalies([point(0, [a(10, "C1", { deviationMinutes: 7 })])]);
        expect(s).toEqual([expect.objectContaining({ kind: "official_delay", level: "demora_estimada", minutes: 7 })]);
    });

    it("salto de ETA de la misma unidad", () => {
        const s = detectAnomalies([point(0, [a(10, "C1")]), point(1, [a(9, "C1")]), point(2, [a(16, "C1")])]);
        const jump = s.find((x) => x.kind === "eta_jump");
        expect(jump).toMatchObject({ level: "anomalia_detectada", vehicleId: "C1", minutes: 8 });
        expect(jump?.message).toBe("El tiempo estimado de la unidad C1 aumentó 8 min de golpe.");
    });

    it("descuento normal no es anomalía", () => {
        const s = detectAnomalies([point(0, [a(10, "C1")]), point(1, [a(9, "C1")]), point(2, [a(8, "C1")])]);
        expect(s.filter((x) => x.level !== "datos_insuficientes")).toEqual([]);
    });

    it("ETA estancado durante varios minutos", () => {
        const s = detectAnomalies([point(0, [a(7, "C1")]), point(3, [a(7, "C1")]), point(6, [a(7, "C1")])]);
        expect(s.find((x) => x.kind === "eta_stalled")).toMatchObject({ minutes: 6 });
    });

    it("GPS sin actualizar", () => {
        const s = detectAnomalies([point(10, [a(5, "C1", { gpsAt: T0 + 2 * MIN })])]);
        expect(s.find((x) => x.kind === "gps_frozen")).toMatchObject({ minutes: 8, level: "anomalia_detectada" });
    });

    it("intervalo anormal entre unidades (relativo y con headway histórico)", () => {
        const relative = detectAnomalies([point(0, [a(2, "A"), a(8, "B"), a(14, "C"), a(48, "D")])]);
        expect(relative.find((x) => x.kind === "headway_gap")).toMatchObject({ minutes: 34 });
        const withHistory = detectAnomalies([point(0, [a(2, "A"), a(22, "B")])], { expectedHeadwayMin: 8 });
        expect(withHistory.find((x) => x.kind === "headway_gap")).toMatchObject({ minutes: 20 });
        expect(detectAnomalies([point(0, [a(2, "A"), a(22, "B")])]).some((x) => x.kind === "headway_gap")).toBe(false);
    });

    it("los mensajes no atribuyen causas", () => {
        const s = detectAnomalies([point(0, [a(10, "C1", { gpsAt: T0 - 9 * MIN, deviationMinutes: 6 })]), point(1, [a(9, "C1")]), point(2, [a(17, "C1")])]);
        for (const x of s) expect(x.message).not.toMatch(/accidente|tránsito|trafico|tráfico|choque|paro|corte/i);
    });
});

describe("confirmedDelays", () => {
    const base: InferredArrival = {
        stopId: "P1",
        lineCode: "531",
        vehicleId: "C1",
        arrivedAt: T0 + 15 * MIN,
        method: "arriving_status",
        confidence: "high",
        lastOfficialEtaMinutes: 4,
        lastOfficialEtaAt: T0,
    };

    it("sólo con confianza alta y llegada tardía", () => {
        expect(confirmedDelays([base])).toEqual([expect.objectContaining({ level: "demora_confirmada", minutes: 11 })]);
        expect(confirmedDelays([{ ...base, confidence: "medium" }])).toEqual([]);
        expect(confirmedDelays([{ ...base, arrivedAt: T0 + 6 * MIN }])).toEqual([]);
    });
});

describe("mostRelevant", () => {
    it("prioriza el mayor nivel de evidencia", () => {
        // El desvío oficial cuenta sólo en la consulta más reciente.
        const s = detectAnomalies([point(0, [a(10, "C1")]), point(1, [a(9, "C1")]), point(2, [a(30, "C1", { deviationMinutes: 6 })])]);
        expect(s.some((x) => x.kind === "eta_jump")).toBe(true);
        expect(mostRelevant(s)?.level).toBe("demora_estimada");
        expect(mostRelevant([])).toBeNull();
    });
});
