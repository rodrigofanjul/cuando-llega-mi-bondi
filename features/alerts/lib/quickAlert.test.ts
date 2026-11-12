import { describe, expect, it } from "vitest";

import { alertRuleSchema } from "./engine";
import { quickAlertRule } from "./quickAlert";

const NOW = Date.parse("2026-11-12T21:30:00Z"); // 18:30 MDP
const target = { stopId: "10101", stopLabel: "Luro y Salta", lineCode: "98", lineLabel: "511", destination: "" };

describe("quickAlertRule", () => {
    it("usa caminata + 2 min y vale por 2 h hoy", () => {
        const r = quickAlertRule({ id: "q1", target, walkMin: 6, now: NOW });
        expect(alertRuleSchema.safeParse(r).success).toBe(true);
        expect(r.trigger).toEqual({ type: "eta-threshold", minutes: 8 });
        expect(r.schedule).toEqual({ type: "once", date: "2026-11-12", from: "18:30", to: "20:30" });
    });

    it("sin caminata usa 5 min", () => {
        expect(quickAlertRule({ id: "q2", target, walkMin: null, now: NOW }).trigger).toEqual({ type: "eta-threshold", minutes: 5 });
    });

    it("no cruza medianoche", () => {
        const late = Date.parse("2026-11-13T02:30:00Z"); // 23:30 MDP
        expect(quickAlertRule({ id: "q3", target, walkMin: 3, now: late }).schedule).toMatchObject({ from: "23:30", to: "23:59" });
    });

    it("acota a 60 min", () => {
        expect(quickAlertRule({ id: "q4", target, walkMin: 90, now: NOW }).trigger).toEqual({ type: "eta-threshold", minutes: 60 });
    });
});
