import { describe, expect, it } from "vitest";

import type { NormalizedArrival } from "@features/arrivals/lib/normalize";
import { indexSnapshots, type QuerySnapshot } from "@features/widgets/lib/rows";

import {
    EMPTY_ALERT_STATE,
    alertRuleSchema,
    evaluateAlerts,
    isExpired,
    isScheduleActive,
    type AlertRule,
} from "./engine";

const MIN = 60_000;
// Miércoles 2026-11-11 08:45 local
const NOW = Date.parse("2026-11-11T11:45:00Z");
const T = { stopId: "P1", stopLabel: "Luro y Salta", lineCode: "531", lineLabel: "531", destination: "" };

function rule(partial: Partial<Omit<AlertRule, "trigger" | "schedule">> & { trigger: unknown; schedule?: unknown }): AlertRule {
    return alertRuleSchema.parse({
        id: "r1",
        targets: [T],
        schedule: { type: "recurring", days: [1, 2, 3, 4, 5], from: "07:00", to: "10:00" },
        ...partial,
    });
}

function bus(eta: number | null, vehicleId: string | null, extra: Partial<NormalizedArrival> = {}): NormalizedArrival {
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

function idx(arrivals: NormalizedArrival[], fetchedAt = NOW): ReturnType<typeof indexSnapshots> {
    const s: QuerySnapshot = { stopId: "P1", lineCode: "531", fetchedAt, arrivals, error: null };
    return indexSnapshots([s]);
}

describe("agenda", () => {
    it("recurrente por días y franja", () => {
        const r = rule({ trigger: { type: "eta-threshold", minutes: 10 } });
        expect(isScheduleActive(r, NOW)).toBe(true);
        expect(isScheduleActive(r, NOW + 2 * 60 * MIN)).toBe(false); // 10:45
        expect(isScheduleActive(r, Date.parse("2026-11-15T11:45:00Z"))).toBe(false); // domingo
    });

    it("única: sólo su fecha local y luego expira", () => {
        const r = rule({ trigger: { type: "eta-threshold", minutes: 10 }, schedule: { type: "once", date: "2026-11-11" } });
        expect(isScheduleActive(r, NOW)).toBe(true);
        expect(isExpired(r, NOW)).toBe(false);
        expect(isExpired(r, NOW + 24 * 60 * MIN)).toBe(true);
    });
});

describe("umbral de ETA", () => {
    const r = rule({ trigger: { type: "eta-threshold", minutes: 10 } });

    it("notifica al cruzar el umbral y una sola vez por colectivo", () => {
        const a = evaluateAlerts([r], idx([bus(14, "C1")]), EMPTY_ALERT_STATE, NOW);
        expect(a.notifications).toHaveLength(0);

        const b = evaluateAlerts([r], idx([bus(10, "C1")], NOW + 4 * MIN), a.state, NOW + 4 * MIN);
        expect(b.notifications).toHaveLength(1);
        expect(b.notifications[0].title).toBe("531 a 10 min");

        const c = evaluateAlerts([r], idx([bus(8, "C1")], NOW + 6 * MIN), b.state, NOW + 6 * MIN);
        expect(c.notifications).toHaveLength(0);
    });

    it("otro colectivo de la misma línea vuelve a notificar", () => {
        const first = evaluateAlerts([r], idx([bus(9, "C1")]), EMPTY_ALERT_STATE, NOW);
        const second = evaluateAlerts([r], idx([bus(9, "C2")], NOW + MIN), first.state, NOW + MIN);
        expect(first.notifications).toHaveLength(1);
        expect(second.notifications).toHaveLength(1);
    });

    it("ignora un salto espurio muy por debajo del umbral sin cruce observado", () => {
        const out = evaluateAlerts([r], idx([bus(2, "C9")]), EMPTY_ALERT_STATE, NOW);
        expect(out.notifications).toHaveLength(0);
    });

    it("sin id de unidad aplica enfriamiento", () => {
        const a = evaluateAlerts([r], idx([bus(10, null)]), EMPTY_ALERT_STATE, NOW);
        const b = evaluateAlerts([r], idx([bus(9, null)], NOW + 5 * MIN), a.state, NOW + 5 * MIN);
        const c = evaluateAlerts([r], idx([bus(10, null)], NOW + 16 * MIN), b.state, NOW + 16 * MIN);
        expect([a, b, c].map((x) => x.notifications.length)).toEqual([1, 0, 1]);
    });

    it("no usa datos vencidos ni fuera de franja ni reglas deshabilitadas", () => {
        expect(evaluateAlerts([r], idx([bus(10, "C1")], NOW - 11 * MIN), EMPTY_ALERT_STATE, NOW).notifications).toHaveLength(0);
        expect(evaluateAlerts([{ ...r, enabled: false }], idx([bus(10, "C1")]), EMPTY_ALERT_STATE, NOW).notifications).toHaveLength(0);
        const late = NOW + 3 * 60 * MIN;
        expect(evaluateAlerts([r], idx([bus(10, "C1")], late), EMPTY_ALERT_STATE, late).notifications).toHaveLength(0);
    });

    it("purga el estado de deduplicación a las 24 h", () => {
        const a = evaluateAlerts([r], idx([bus(10, "C1")]), EMPTY_ALERT_STATE, NOW);
        const tomorrow = NOW + 24 * 60 * MIN;
        const b = evaluateAlerts([r], idx([bus(10, "C1")], tomorrow), a.state, tomorrow);
        expect(Object.keys(b.state.fired)).toHaveLength(1);
        expect(b.notifications).toHaveLength(1);
    });
});

describe("demora", () => {
    it("avisa demora estimada según desvío informado, sin atribuir causa", () => {
        const r = rule({ trigger: { type: "delay", minDelayMin: 5 } });
        const out = evaluateAlerts([r], idx([bus(12, "C1", { deviationMinutes: 7 })]), EMPTY_ALERT_STATE, NOW);
        expect(out.notifications[0].title).toBe("531: demora estimada de 7 min");
        const none = evaluateAlerts([r], idx([bus(12, "C1", { deviationMinutes: 3 })]), EMPTY_ALERT_STATE, NOW);
        expect(none.notifications).toHaveLength(0);
    });
});

describe("salir de casa", () => {
    const r = rule({ trigger: { type: "leave-home", walkMin: 5, marginMin: 1, leadMin: 1 } });

    it("avisa cuando llega la hora de salir", () => {
        // eta 9, caminata 5, margen 1, incertidumbre 1 → holgura 2 → aún no
        expect(evaluateAlerts([r], idx([bus(9, "C1")]), EMPTY_ALERT_STATE, NOW).notifications).toHaveLength(0);
        // eta 8 → holgura 1 → dentro del aviso anticipado
        const out = evaluateAlerts([r], idx([bus(8, "C1")]), EMPTY_ALERT_STATE, NOW);
        expect(out.notifications[0].title).toBe("Salí ahora para el 531");
    });

    it("si el colectivo ya no se alcanza, no avisa", () => {
        expect(evaluateAlerts([r], idx([bus(4, "C1")]), EMPTY_ALERT_STATE, NOW).notifications).toHaveLength(0);
    });
});
