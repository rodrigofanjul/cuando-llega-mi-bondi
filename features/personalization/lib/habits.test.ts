import { describe, expect, it } from "vitest";

import { MAX_EVENTS, recordEvent, suggest, type HabitEvent } from "./habits";

const DAY = 86_400_000;
// Miércoles 2026-11-11 08:00 MDP
const WED_0800 = Date.parse("2026-11-11T11:00:00Z");
const favs = new Set(["casa", "trabajo"]);

function days(n: number, favId: string, offsetMin = 0, base = WED_0800): HabitEvent[] {
    // n días hábiles hacia atrás (saltea fines de semana) a la misma hora.
    const out: HabitEvent[] = [];
    let d = 1;
    while (out.length < n) {
        const t = base - d * DAY + offsetMin * 60_000;
        const wd = new Date(t - 3 * 3_600_000).getUTCDay();
        if (wd !== 0 && wd !== 6) out.push({ favId, at: t });
        d++;
    }
    return out;
}

describe("recordEvent", () => {
    it("redondea al minuto, aplica retención y tope", () => {
        const e = recordEvent([], "casa", WED_0800 + 37_123);
        expect(e).toEqual([{ favId: "casa", at: WED_0800 }]);
        const old = [{ favId: "x", at: WED_0800 - 61 * DAY }];
        expect(recordEvent(old, "casa", WED_0800)).toEqual([{ favId: "casa", at: WED_0800 }]);
        const many = Array.from({ length: MAX_EVENTS }, (_, i) => ({ favId: "x", at: WED_0800 - i * 60_000 }));
        expect(recordEvent(many, "casa", WED_0800)).toHaveLength(MAX_EVENTS);
    });
});

describe("suggest", () => {
    it("sugiere el favorito habitual de la franja con explicación", () => {
        const s = suggest([...days(4, "casa", 10), ...days(1, "trabajo", -20)], WED_0800, favs);
        expect(s).toMatchObject({ favId: "casa", occurrences: 4 });
        expect(s?.reason).toBe("Lo consultaste 4 veces los días hábiles a esta hora en los últimos 60 días.");
    });

    it("no sugiere con poco uso, sin mayoría clara, fuera de franja o en otro tipo de día", () => {
        expect(suggest(days(2, "casa"), WED_0800, favs)).toBeNull();
        expect(suggest([...days(3, "casa"), ...days(3, "trabajo")], WED_0800, favs)).toBeNull();
        expect(suggest(days(5, "casa", 180), WED_0800, favs)).toBeNull();
        const sat = Date.parse("2026-11-14T11:00:00Z");
        expect(suggest(days(5, "casa"), sat, favs)).toBeNull();
    });

    it("ignora favoritos que ya no existen", () => {
        expect(suggest(days(5, "borrado"), WED_0800, favs)).toBeNull();
    });

    it("franja que cruza medianoche", () => {
        const late = Date.parse("2026-11-12T02:50:00Z"); // miércoles 23:50 MDP
        const events = days(3, "casa", 0, Date.parse("2026-11-12T03:20:00Z")); // ~00:20 de días hábiles previos
        expect(suggest(events, late, favs)?.favId).toBe("casa");
    });
});
