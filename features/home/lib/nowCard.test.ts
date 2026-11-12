import { describe, expect, it } from "vitest";

import type { Favorito } from "@features/favorites/types";

import { pickNowCard } from "./nowCard";

const favs: Favorito[] = [
    { id: "P1_98", nombre: "Casa", identificadorParada: "P1", codigoLineaParada: "98", descripcionLinea: "511", descripcionBandera: "—" },
    { id: "P2_120", nombre: "Trabajo", identificadorParada: "P2", codigoLineaParada: "120", descripcionLinea: "542", descripcionBandera: "—" },
];
const stopCoords = new Map([["P1", { lat: -38.0, lng: -57.55 }], ["P2", { lat: -38.1, lng: -57.6 }]]);

describe("pickNowCard", () => {
    it("sin contexto no muestra nada", () => {
        expect(pickNowCard({ favoritos: favs, habitFavId: null, position: null, stopCoords })).toBeNull();
    });

    it("el horario aprendido gana", () => {
        expect(pickNowCard({ favoritos: favs, habitFavId: "P2_120", position: { lat: -38.0, lng: -57.55 }, stopCoords })).toEqual({ favId: "P2_120", reason: "habit" });
    });

    it("por ubicación sólo si está a menos de 400 m", () => {
        expect(pickNowCard({ favoritos: favs, habitFavId: null, position: { lat: -38.0005, lng: -57.5505 }, stopCoords })).toEqual({ favId: "P1_98", reason: "near" });
        expect(pickNowCard({ favoritos: favs, habitFavId: null, position: { lat: -38.05, lng: -57.58 }, stopCoords })).toBeNull();
    });

    it("ignora un hábito que ya no es favorito", () => {
        expect(pickNowCard({ favoritos: favs, habitFavId: "X", position: null, stopCoords })).toBeNull();
    });
});
