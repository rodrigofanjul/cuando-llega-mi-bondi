import { describe, expect, it } from "vitest";

import type { Itinerary, RouteLeg } from "../types";
import { estimateMins, itineraryRankCost } from "./costModel";
import { arrangeTrips, preferenceCost, rankByPreference, scheduleAll, scheduleItinerary } from "./preferences";

const MIN = 60_000;
const NOW = Date.parse("2026-11-11T11:00:00Z");

const walk = (meters: number): RouteLeg => ({ kind: "walk", fromKey: "a", toKey: "b", fromLat: 0, fromLng: 0, toLat: 0, toLng: 0, meters });
const ride = (codLinea: string, meters: number): RouteLeg => ({
    kind: "ride",
    sequenceIdx: 0,
    codLinea,
    lineaLabel: codLinea,
    ramalKey: "r",
    ramalLabel: "r",
    fromParadaId: "p1",
    toParadaId: "p2",
    fromEsquinaLabel: null,
    toEsquinaLabel: null,
    paradaIdsAlong: [],
    meters,
});

function itinerary(legs: RouteLeg[]): Itinerary {
    return {
        legs,
        totalRides: legs.filter((l) => l.kind === "ride").length,
        totalWalkMeters: legs.filter((l) => l.kind === "walk").reduce((a, l) => a + l.meters, 0),
        totalRideMeters: legs.filter((l) => l.kind === "ride").reduce((a, l) => a + l.meters, 0),
    };
}

// A: rápido pero con mucha caminata; B: menos caminata, un transbordo; C: directo, más lento.
const A = itinerary([walk(900), ride("531", 6000), walk(200)]);
const B = itinerary([walk(150), ride("511", 3000), walk(50), ride("573", 4000), walk(100)]);
const C = itinerary([walk(200), ride("541", 9000), walk(150)]);

describe("rankByPreference", () => {
    it("más rápido respeta el costo del planner", () => {
        const order = rankByPreference([B, A, C], { preference: "fastest" });
        const costs = order.map((it) => itineraryRankCost(it));
        expect(costs).toEqual([...costs].sort((x, y) => x - y));
        // C: 350 m a pie + 9 km ≈ 37 min; A: 1.100 m a pie + 6 km ≈ 38,5 min.
        expect(order[0]).toBe(C);
    });

    it("menos caminata prioriza el de menos metros a pie", () => {
        expect(rankByPreference([A, B, C], { preference: "least_walk" })[0]).toBe(B);
    });

    it("menos transbordos penaliza combinaciones", () => {
        const order = rankByPreference([A, B, C], { preference: "fewest_transfers" });
        expect(order.at(-1)).toBe(B);
    });

    it("línea preferida da ventaja sin excluir otras", () => {
        expect(preferenceCost(C, { preference: "fastest", preferredLines: ["541"] })).toBe(preferenceCost(C, { preference: "fastest" }) - 3);
        expect(rankByPreference([A, C], { preference: "fastest", preferredLines: ["541"] })).toHaveLength(2);
    });

    it("orden estable ante empates", () => {
        expect(rankByPreference([A, A], { preference: "fastest" })).toEqual([A, A]);
    });
});

describe("scheduleItinerary", () => {
    const total = estimateMins(A.totalWalkMeters, A.totalRideMeters, A.totalRides);

    it("salir ahora / salir a una hora", () => {
        expect(scheduleItinerary(A, { type: "now" }, NOW)).toMatchObject({ departAt: NOW, arriveAt: NOW + total * MIN, firstWait: "estimated" });
        const at = NOW + 30 * MIN;
        expect(scheduleItinerary(A, { type: "depart_at", at }, NOW)).toMatchObject({ departAt: at, arriveAt: at + total * MIN });
    });

    it("llegar antes de: sale lo más tarde posible y marca si ya no llega", () => {
        const at = NOW + 60 * MIN;
        expect(scheduleItinerary(A, { type: "arrive_by", at }, NOW)).toMatchObject({ arriveAt: at, departAt: at - total * MIN, tooLate: false });
        expect(scheduleItinerary(A, { type: "arrive_by", at: NOW + 5 * MIN }, NOW).tooLate).toBe(true);
    });

    it("con arribo en vivo del primer colectivo reemplaza la espera media", () => {
        const live = scheduleItinerary(A, { type: "now" }, NOW, 20);
        expect(live.firstWait).toBe("live");
        // Caminar 900 m (≈13 min) y el colectivo pasa en 20: sube a los 20 min.
        expect(live.departAt).toBe(NOW + (20 - 13) * MIN);
        expect(live.tooLate).toBe(false);
        expect(scheduleItinerary(A, { type: "now" }, NOW, 5).tooLate).toBe(true);
    });

    it("sólo caminata no tiene espera", () => {
        expect(scheduleItinerary(itinerary([walk(500)]), { type: "now" }, NOW).firstWait).toBe("none");
    });
});

describe("scheduleAll", () => {
    it("en llegar antes de filtra los imposibles y ordena por salida más tardía", () => {
        const at = NOW + 50 * MIN;
        const out = scheduleAll([A, B, C], { type: "arrive_by", at }, NOW);
        expect(out.every((s) => !s.tooLate)).toBe(true);
        for (let i = 1; i < out.length; i++) expect(out[i - 1].departAt).toBeGreaterThanOrEqual(out[i].departAt);
    });
});

describe("arrangeTrips", () => {
    it("devuelve índices alineados con los horarios y filtra en llegar antes de", () => {
        const its = [A, B, C];
        const r = arrangeTrips(its, { preference: "least_walk" }, { type: "now" }, NOW);
        expect(r.order[0]).toBe(1);
        expect(r.schedules[0].itinerary).toBe(B);
        const late = arrangeTrips(its, { preference: "fastest" }, { type: "arrive_by", at: NOW + 5 * MIN }, NOW);
        expect(late.order).toEqual([]);
    });
});
