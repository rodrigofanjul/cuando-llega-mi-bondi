import { describe, expect, it } from "vitest";

import type { Favorito } from "@features/favorites/types";

import { configToDraft, draftToConfig, favoriteToTarget, newDraft, newSlot } from "./draft";

const casa: Favorito = {
    id: "P11003_531",
    nombre: "Casa",
    identificadorParada: "P11003",
    codigoLineaParada: "531",
    lineaLabel: "531",
    descripcionLinea: "531",
    descripcionBandera: "A CENTRO",
    calleLabel: "Luro",
    interseccionLabel: "Salta",
};
const trabajo: Favorito = { ...casa, id: "P2_573", nombre: "Trabajo", identificadorParada: "P2", codigoLineaParada: "573", lineaLabel: "573", descripcionLinea: "573", calleLabel: undefined, interseccionLabel: undefined };
const roto: Favorito = { ...casa, id: "P3_undefined", identificadorParada: "P3", codigoLineaParada: "undefined", lineaLabel: "999", descripcionLinea: "999" };
const favs = [casa, trabajo, roto];
const map = new Map<string, string>();

describe("favoriteToTarget", () => {
    it("usa calle e intersección como etiqueta de parada", () => {
        expect(favoriteToTarget(casa, map, false)).toEqual({
            stopId: "P11003",
            stopLabel: "Luro y Salta",
            lineCode: "531",
            lineLabel: "531",
            destination: "",
        });
    });

    it("sin calles usa el nombre del favorito; con sentido conserva la bandera", () => {
        expect(favoriteToTarget(trabajo, map, true)).toMatchObject({ stopLabel: "Trabajo", destination: "A CENTRO" });
    });

    it("favorito sin línea resoluble → null (no se adivina)", () => {
        expect(favoriteToTarget(roto, map, false)).toBeNull();
    });
});

describe("draftToConfig", () => {
    it("crea un widget de una línea válido", () => {
        const r = draftToConfig({ ...newDraft("w1"), name: " Ir al centro ", favoriteIds: [casa.id] }, favs, map);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.config.kind).toBe("single");
            expect(r.config.name).toBe("Ir al centro");
        }
    });

    it("errores comprensibles", () => {
        expect(draftToConfig(newDraft("w1"), favs, map)).toEqual({ ok: false, error: "Poné un nombre al widget." });
        expect(draftToConfig({ ...newDraft("w1"), name: "X" }, favs, map)).toMatchObject({ ok: false, error: "Elegí al menos una parada favorita." });
        expect(draftToConfig({ ...newDraft("w1"), name: "X", favoriteIds: [casa.id, trabajo.id] }, favs, map)).toMatchObject({ ok: false });
        expect(draftToConfig({ ...newDraft("w1"), name: "X", favoriteIds: [roto.id] }, favs, map).ok).toBe(false);
    });

    it("multilínea e inteligente", () => {
        const multi = draftToConfig({ ...newDraft("m"), name: "Varias", kind: "multi", favoriteIds: [casa.id, trabajo.id] }, favs, map);
        expect(multi.ok && multi.config.kind === "multi" && multi.config.targets.length).toBe(2);

        const smart = draftToConfig(
            {
                ...newDraft("s"),
                name: "Inteligente",
                kind: "smart",
                slots: [{ ...newSlot("home"), favoriteIds: [casa.id] }, { ...newSlot("work"), from: "17:00", to: "19:00", favoriteIds: [trabajo.id] }],
            },
            favs,
            map,
        );
        expect(smart.ok).toBe(true);

        const noSlots = draftToConfig({ ...newDraft("s"), name: "I", kind: "smart" }, favs, map);
        expect(noSlots).toEqual({ ok: false, error: "Agregá al menos una franja horaria." });
    });

    it("hora inválida la detecta zod", () => {
        const r = draftToConfig(
            { ...newDraft("s"), name: "I", kind: "smart", slots: [{ ...newSlot(), from: "25:00", favoriteIds: [casa.id] }] },
            favs,
            map,
        );
        expect(r.ok).toBe(false);
    });
});

describe("configToDraft", () => {
    it("ida y vuelta conserva la selección", () => {
        const draft = { ...newDraft("m"), name: "Varias", kind: "multi" as const, sameDirection: true, favoriteIds: [casa.id, trabajo.id] };
        const r = draftToConfig(draft, favs, map);
        if (!r.ok) throw new Error(r.error);
        expect(configToDraft(r.config, favs, map)).toEqual(draft);
    });
});
