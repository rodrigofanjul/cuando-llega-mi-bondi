import { describe, expect, it } from "vitest";

import { arLocalParts, inWindow, parseHhMm, windowLength } from "./argentina";

describe("arLocalParts", () => {
    it("convierte a hora local UTC−3", () => {
        // 2026-11-11T11:45Z = miércoles 08:45 en MDP
        expect(arLocalParts(Date.parse("2026-11-11T11:45:00Z"))).toEqual({
            weekday: 3,
            minuteOfDay: 8 * 60 + 45,
            date: "2026-11-11",
        });
    });

    it("cambia de día local antes que UTC", () => {
        // 02:30Z del jueves = 23:30 del miércoles local
        const p = arLocalParts(Date.parse("2026-11-12T02:30:00Z"));
        expect(p.weekday).toBe(3);
        expect(p.date).toBe("2026-11-11");
        expect(p.minuteOfDay).toBe(23 * 60 + 30);
    });
});

describe("parseHhMm", () => {
    it("acepta HH:MM válidos y rechaza el resto", () => {
        expect(parseHhMm("00:00")).toBe(0);
        expect(parseHhMm("23:59")).toBe(1439);
        expect(parseHhMm("24:00")).toBeNull();
        expect(parseHhMm("7:30")).toBeNull();
        expect(parseHhMm("07:60")).toBeNull();
    });
});

describe("inWindow / windowLength", () => {
    it("franja normal es semiabierta", () => {
        expect(inWindow(420, 420, 600)).toBe(true);
        expect(inWindow(600, 420, 600)).toBe(false);
    });

    it("franja que cruza medianoche", () => {
        expect(inWindow(23 * 60, 22 * 60, 120)).toBe(true);
        expect(inWindow(60, 22 * 60, 120)).toBe(true);
        expect(inWindow(180, 22 * 60, 120)).toBe(false);
        expect(windowLength(22 * 60, 120)).toBe(240);
    });

    it("from === to es todo el día", () => {
        expect(inWindow(999, 300, 300)).toBe(true);
        expect(windowLength(300, 300)).toBe(1440);
    });
});
