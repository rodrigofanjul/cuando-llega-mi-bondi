import { describe, expect, it } from "vitest";

import { arrivalDisplay } from "./arrivalDisplay";

const T = Date.parse("2026-11-12T12:00:00Z"); // 09:00 en MDP
const MIN = 60_000;

describe("arrivalDisplay", () => {
    it("en vivo con minutos proyectados", () => {
        const d = arrivalDisplay({ kind: "live", etaMinutes: 5, arriving: false, fetchedAt: T - MIN, now: T });
        expect(d).toMatchObject({ state: "live", text: "4 min", pulse: true });
        expect(d.spoken).toBe("llega en 4 minutos");
    });

    it("llegando", () => {
        const d = arrivalDisplay({ kind: "live", etaMinutes: 0, arriving: true, fetchedAt: T, now: T });
        expect(d).toMatchObject({ state: "arriving", text: "Llegando", spoken: "está llegando" });
    });

    it("menos de un minuto", () => {
        expect(arrivalDisplay({ kind: "live", etaMinutes: 0, arriving: false, fetchedAt: T, now: T }).text).toBe("< 1 min");
    });

    it("envejeciendo muestra la antigüedad", () => {
        const d = arrivalDisplay({ kind: "live", etaMinutes: 12, arriving: false, fetchedAt: T - 4 * MIN, now: T });
        expect(d).toMatchObject({ state: "aging", text: "8 min", note: "hace 4 min", pulse: false });
    });

    it("vencido nunca muestra minutos", () => {
        const d = arrivalDisplay({ kind: "live", etaMinutes: 12, arriving: false, fetchedAt: T - 15 * MIN, now: T });
        expect(d.state).toBe("stale");
        expect(d.text).toBe("Dato de las 08:45");
        expect(d.spoken).toBe("dato vencido de las 08:45");
    });

    it("estimación histórica", () => {
        const d = arrivalDisplay({ kind: "historical", medianMin: 7, highMin: 17 });
        expect(d).toMatchObject({ state: "historical", text: "≈ 7 min", note: "histórico · hasta 17" });
        expect(d.spoken).toBe("estimación histórica, alrededor de 7 minutos");
    });

    it("sin servicio con frecuencia publicada", () => {
        expect(arrivalDisplay({ kind: "none", headwayMin: 12 })).toMatchObject({ state: "none", text: "Sin arribos ahora", note: "pasa cada ~12 min" });
        expect(arrivalDisplay({ kind: "none", headwayMin: null }).note).toBeNull();
    });

    it("singular de minuto", () => {
        expect(arrivalDisplay({ kind: "live", etaMinutes: 1, arriving: false, fetchedAt: T, now: T }).spoken).toBe("llega en 1 minuto");
    });

    it("fetchedAt apenas en el futuro no genera antigüedad negativa", () => {
        const d = arrivalDisplay({ kind: "live", etaMinutes: 5, arriving: false, fetchedAt: T + 30_000, now: T });
        expect(d.note ?? "").not.toMatch(/-/);
    });

    it("'sin arribos' de hace rato lleva la edad del dato", () => {
        expect(arrivalDisplay({ kind: "none", headwayMin: null, fetchedAt: T - 30_000, now: T }).note).toBeNull();
        expect(arrivalDisplay({ kind: "none", headwayMin: null, fetchedAt: T - 3 * MIN, now: T }).note).toBe("hace 3 min");
        expect(arrivalDisplay({ kind: "none", headwayMin: 12, fetchedAt: T - 3 * MIN, now: T }).note).toBe("hace 3 min · pasa cada ~12 min");
        expect(arrivalDisplay({ kind: "none", headwayMin: null, fetchedAt: T - 20 * MIN, now: T }).note).toBe("Dato de las 08:40");
    });});
