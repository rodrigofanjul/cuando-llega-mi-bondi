import { describe, expect, it, vi } from "vitest";

import type { Arribo } from "@features/arrivals/types";

import { EMPTY_ALERT_STATE, alertRuleSchema, type AlertRule } from "./engine";
import { MAX_QUERIES_PER_CYCLE, activeQueries, runAlertCycle } from "./runner";

const NOW = Date.parse("2026-11-11T11:45:00Z"); // miércoles 08:45 MDP
const target = (stopId: string, lineCode = "531") => ({ stopId, stopLabel: `Parada ${stopId}`, lineCode, lineLabel: lineCode, destination: "" });

function rule(id: string, extra: Partial<Record<string, unknown>> = {}): AlertRule {
    return alertRuleSchema.parse({
        id,
        targets: [target("P1")],
        trigger: { type: "eta-threshold", minutes: 10 },
        schedule: { type: "recurring", days: [1, 2, 3, 4, 5], from: "07:00", to: "10:00" },
        ...extra,
    });
}

const arribo = (eta: string, coche = "C1") => ({ Arribo: eta, IdentificadorCoche: coche, DescripcionCartelBandera: "A CENTRO" }) as Arribo;

describe("activeQueries", () => {
    it("sólo reglas habilitadas y en franja; deduplica; respeta el tope", () => {
        const rules = [
            rule("a"),
            rule("b"),
            rule("off", { enabled: false, targets: [target("P9")] }),
            rule("night", { targets: [target("P8")], schedule: { type: "recurring", days: [3], from: "22:00", to: "23:00" } }),
            ...Array.from({ length: 12 }, (_, i) => rule(`m${i}`, { targets: [target(`Q${i}`)] })),
        ];
        const q = activeQueries(rules, NOW);
        expect(q[0]).toEqual({ stopId: "P1", lineCode: "531" });
        expect(q.some((x) => x.stopId === "P9" || x.stopId === "P8")).toBe(false);
        expect(q).toHaveLength(MAX_QUERIES_PER_CYCLE);
    });
});

describe("runAlertCycle", () => {
    it("notifica y deduplica entre ciclos", async () => {
        const notify = vi.fn(async () => true);
        const fetchArribos = vi.fn(async () => ({ arribos: [arribo("9 min. aprox.")], stale: false }));
        const deps = { now: () => NOW, fetchArribos, notify };
        const first = await runAlertCycle([rule("a")], EMPTY_ALERT_STATE, deps);
        expect(first.notified).toHaveLength(1);
        expect(fetchArribos).toHaveBeenCalledWith("P1", "531");
        const second = await runAlertCycle([rule("a")], first.state, deps);
        expect(second.notified).toHaveLength(0);
    });

    it("sin permiso no marca como enviada y reintenta", async () => {
        const notify = vi.fn(async () => false);
        const deps = { now: () => NOW, fetchArribos: async () => ({ arribos: [arribo("9 min. aprox.")], stale: false }), notify };
        const r = await runAlertCycle([rule("a")], EMPTY_ALERT_STATE, deps);
        expect(r.undelivered).toHaveLength(1);
        expect(Object.keys(r.state.fired)).toHaveLength(0);
    });

    it("datos STALE y errores de red no disparan alertas", async () => {
        const notify = vi.fn(async () => true);
        const stale = await runAlertCycle([rule("a")], EMPTY_ALERT_STATE, {
            now: () => NOW,
            fetchArribos: async () => ({ arribos: [arribo("9 min. aprox.")], stale: true }),
            notify,
        });
        const failing = await runAlertCycle([rule("a")], EMPTY_ALERT_STATE, {
            now: () => NOW,
            fetchArribos: async () => {
                throw new Error("red");
            },
            notify,
        });
        expect(stale.notified).toHaveLength(0);
        expect(failing.errors).toBe(1);
        expect(notify).not.toHaveBeenCalled();
    });

    it("informa alertas únicas vencidas y no las consulta", async () => {
        const fetchArribos = vi.fn(async () => ({ arribos: [], stale: false }));
        const old = rule("old", { schedule: { type: "once", date: "2026-11-10" } });
        const r = await runAlertCycle([old], EMPTY_ALERT_STATE, { now: () => NOW, fetchArribos, notify: async () => true });
        expect(r.expiredRuleIds).toEqual(["old"]);
        expect(fetchArribos).not.toHaveBeenCalled();
    });
});
