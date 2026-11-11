import { describe, expect, it } from "vitest";

import type { Favorito } from "@features/favorites/types";

import { alertDraftToRule, describeRule, newAlertDraft } from "./draft";

const NOW = Date.parse("2026-11-11T11:45:00Z");
const fav: Favorito = {
    id: "P1_531",
    nombre: "Casa",
    identificadorParada: "P1",
    codigoLineaParada: "531",
    lineaLabel: "531",
    descripcionLinea: "531",
    descripcionBandera: "A CENTRO",
    calleLabel: "Luro",
    interseccionLabel: "Salta",
};
const map = new Map<string, string>();

describe("alertDraftToRule", () => {
    it("umbral recurrente", () => {
        const r = alertDraftToRule({ ...newAlertDraft("a1"), favoriteIds: [fav.id] }, [fav], map, NOW);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.rule.trigger).toEqual({ type: "eta-threshold", minutes: 10 });
            expect(describeRule(r.rule)).toBe("531 en Luro y Salta: cuando esté a 10 min · Lun Mar Mié Jue Vie 07:00–09:00");
        }
    });

    it("única: usa la fecha local de hoy", () => {
        const r = alertDraftToRule(
            { ...newAlertDraft("a2"), favoriteIds: [fav.id], recurring: false, trigger: "leave-home", walkMin: 6 },
            [fav],
            map,
            NOW,
        );
        expect(r.ok && r.rule.schedule).toEqual({ type: "once", date: "2026-11-11", from: "07:00", to: "09:00" });
        expect(r.ok && r.rule.trigger).toEqual({ type: "leave-home", walkMin: 6, marginMin: 2, leadMin: 1 });
    });

    it("errores comprensibles", () => {
        expect(alertDraftToRule(newAlertDraft("a"), [fav], map, NOW)).toEqual({ ok: false, error: "Elegí al menos una parada favorita." });
        expect(alertDraftToRule({ ...newAlertDraft("a"), favoriteIds: [fav.id], days: [] }, [fav], map, NOW)).toEqual({
            ok: false,
            error: "Elegí al menos un día.",
        });
        const bad = alertDraftToRule({ ...newAlertDraft("a"), favoriteIds: [fav.id], thresholdMin: 0 }, [fav], map, NOW);
        expect(bad.ok).toBe(false);
    });
});
