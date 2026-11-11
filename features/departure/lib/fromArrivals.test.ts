import { describe, expect, it } from "vitest";

import type { Arribo } from "@features/arrivals/types";

import { adviseFromArrivals, stopCoordinates } from "./fromArrivals";

const MIN = 60_000;
const NOW = 1_794_397_500_000;
const a = (eta: string, coche = "C1", extra: Partial<Arribo> = {}) => ({ Arribo: eta, IdentificadorCoche: coche, ...extra }) as Arribo;
const base = { stopId: "P1", lineCode: "531", walkMin: 5, marginMin: 0, fetchedAt: NOW, now: NOW, stale: false };

describe("adviseFromArrivals", () => {
    it("recomienda a partir del ETA proyectado", () => {
        const r = adviseFromArrivals({ ...base, arribos: [a("12 min. aprox.")], now: NOW + 2 * MIN, fetchedAt: NOW }, null);
        // ETA proyectado 10, caminata 5, incertidumbre 2 → salir en 3
        expect(r).toMatchObject({ kind: "leave-in", busEta: 10, leaveAt: NOW + 5 * MIN });
    });

    it("no recomienda con datos STALE o vencidos", () => {
        expect(adviseFromArrivals({ ...base, arribos: [a("9 min")], stale: true }, null)).toEqual({ kind: "stale-data" });
        expect(adviseFromArrivals({ ...base, arribos: [a("9 min")], now: NOW + 11 * MIN }, null)).toEqual({ kind: "stale-data" });
    });

    it("ignora arribos sin ETA reconocible", () => {
        expect(adviseFromArrivals({ ...base, arribos: [a("Sin datos")] }, null)).toEqual({ kind: "no-data" });
    });
});

describe("stopCoordinates", () => {
    it("toma la primera coordenada válida de la parada", () => {
        expect(stopCoordinates([a("1 min", "0", { LatitudParada: "0", LongitudParada: "0" }), a("2 min", "0", { LatitudParada: "-38.01", LongitudParada: "-57.55" })])).toEqual({
            lat: -38.01,
            lng: -57.55,
        });
        expect(stopCoordinates([])).toBeNull();
    });
});
