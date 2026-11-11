import { describe, expect, it } from "vitest";

import {
    DEFAULT_ADVISOR,
    describeRecommendation,
    recommend,
    stabilize,
    walkMinutes,
    type Recommendation,
} from "./advisor";

const MIN = 60_000;
const NOW = Date.parse("2026-11-11T11:45:00Z");
const noMargin = { ...DEFAULT_ADVISOR, safetyMarginMin: 0 };

describe("walkMinutes", () => {
    it("aplica factor de desvío y redondea hacia arriba", () => {
        // ~300 m en línea recta → 390 m reales a 1.25 m/s = 5.2 min → 6
        const origin = { lat: -38.0, lng: -57.55 };
        const stop = { lat: -38.0027, lng: -57.55 };
        expect(walkMinutes(origin, stop)).toBe(6);
    });

    it("misma ubicación → 0", () => {
        expect(walkMinutes({ lat: -38, lng: -57.5 }, { lat: -38, lng: -57.5 })).toBe(0);
    });
});

describe("recommend", () => {
    it("ejemplo del enunciado: llega en 9, camino 5 → salir en 2 (margen 0, incertidumbre 2)", () => {
        const r = recommend([{ etaMinutes: 9, vehicleId: "A", uncertaintyMin: 2 }], 5, NOW, noMargin);
        expect(r).toMatchObject({ kind: "leave-in", leaveAt: NOW + 2 * MIN, busEta: 9, walkMin: 5 });
        expect(describeRecommendation(r, NOW)).toBe(
            "El colectivo llega en aproximadamente 9 min. Tardás 5 min caminando. Te recomendamos salir en 2 min.",
        );
    });

    it("sin holgura → salir ahora", () => {
        const r = recommend([{ etaMinutes: 8, vehicleId: null, uncertaintyMin: 1 }], 5, NOW);
        expect(r.kind).toBe("leave-now");
    });

    it("si el primero no se alcanza, apunta al siguiente y lo informa", () => {
        const r = recommend(
            [
                { etaMinutes: 25, vehicleId: "B" },
                { etaMinutes: 3, vehicleId: "A" },
            ],
            6,
            NOW,
        );
        expect(r).toMatchObject({ kind: "leave-in", vehicleId: "B", skippedBuses: 1 });
    });

    it("ningún colectivo alcanzable / sin datos", () => {
        expect(recommend([{ etaMinutes: 2, vehicleId: null }], 10, NOW).kind).toBe("no-catchable-bus");
        expect(recommend([], 10, NOW).kind).toBe("no-data");
    });

    it("la incertidumbre por defecto crece con el horizonte", () => {
        const near = recommend([{ etaMinutes: 10, vehicleId: null }], 0, NOW, noMargin);
        const far = recommend([{ etaMinutes: 40, vehicleId: null }], 0, NOW, noMargin);
        if (near.kind !== "leave-in" || far.kind !== "leave-in") throw new Error("esperaba leave-in");
        expect(near.bufferMin).toBe(2);
        expect(far.bufferMin).toBe(6);
    });
});

describe("stabilize", () => {
    type Actionable = Extract<Recommendation, { leaveAt: number }>;
    const first = recommend([{ etaMinutes: 15, vehicleId: "A", uncertaintyMin: 2 }], 5, NOW, noMargin) as Actionable;

    it("ignora fluctuaciones chicas del mismo colectivo", () => {
        // 1 min después el ETA baja a 15 (debía bajar a 14): salida se correría 1 min más tarde.
        const next = recommend([{ etaMinutes: 15, vehicleId: "A", uncertaintyMin: 2 }], 5, NOW + MIN, noMargin);
        const s = stabilize(first, next, NOW + MIN);
        if (s.kind !== "leave-in") throw new Error();
        expect(s.leaveAt).toBe(first.leaveAt);
        expect(s.busEta).toBe(15);
    });

    it("comunica siempre que hay que salir antes", () => {
        const next = recommend([{ etaMinutes: 11, vehicleId: "A", uncertaintyMin: 2 }], 5, NOW + MIN, noMargin);
        const s = stabilize(first, next, NOW + MIN);
        if (s.kind === "no-data" || s.kind === "no-catchable-bus") throw new Error();
        expect(s.leaveAt).toBe(NOW + 5 * MIN);
    });

    it("atrasar sólo con cambio grande", () => {
        const late = recommend([{ etaMinutes: 20, vehicleId: "A", uncertaintyMin: 2 }], 5, NOW, noMargin);
        if (late.kind !== "leave-in") throw new Error();
        expect(stabilize(first, late, NOW)).toEqual(late);
    });

    it("cambio de colectivo objetivo siempre se comunica", () => {
        const other = recommend([{ etaMinutes: 16, vehicleId: "B", uncertaintyMin: 2 }], 5, NOW, noMargin);
        expect(stabilize(first, other, NOW)).toEqual(other);
    });

    it("sin id de unidad usa coherencia temporal del ETA", () => {
        const a = recommend([{ etaMinutes: 15, vehicleId: null, uncertaintyMin: 2 }], 5, NOW, noMargin);
        const b = recommend([{ etaMinutes: 13, vehicleId: null, uncertaintyMin: 2 }], 5, NOW + 2 * MIN, noMargin);
        const s = stabilize(a, b, NOW + 2 * MIN);
        if (s.kind === "no-data" || s.kind === "no-catchable-bus" || a.kind !== "leave-in") throw new Error();
        expect(s.leaveAt).toBe(a.leaveAt);
    });

    it("pasa a salir-ahora cuando se acerca la hora conservada", () => {
        const next = recommend([{ etaMinutes: 8, vehicleId: "A", uncertaintyMin: 2 }], 5, NOW + 7.5 * MIN, noMargin);
        const s = stabilize(first, next, NOW + 7.5 * MIN);
        expect(s.kind).toBe("leave-now");
    });
});
