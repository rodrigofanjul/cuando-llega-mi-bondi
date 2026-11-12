import { describe, expect, it } from "vitest";

import type { Favorito } from "@features/favorites/types";

import { groupByCorner } from "./corners";

const fav = (id: string, stop: string, line: string, calle?: string, inter?: string, nombre = id): Favorito => ({
    id, nombre, identificadorParada: stop, codigoLineaParada: line, lineaLabel: line, descripcionLinea: line, descripcionBandera: "—", calleLabel: calle, interseccionLabel: inter,
});

describe("groupByCorner", () => {
    it("agrupa por esquina normalizada respetando el orden del primer favorito", () => {
        const g = groupByCorner([
            fav("a", "P1", "511", "LURO", "SALTA"),
            fav("b", "P9", "573", "INDEPENDENCIA", "COLON"),
            fav("c", "P1", "542", "Luro", "Salta"),
        ]);
        expect(g.map((x) => x.title)).toEqual(["Luro y Salta", "Independencia y Colon"]);
        expect(g[0].favorites.map((f) => f.id)).toEqual(["a", "c"]);
    });

    it("sin calle agrupa por parada y usa el nombre del favorito", () => {
        const g = groupByCorner([fav("a", "P1", "511", undefined, undefined, "Casa"), fav("b", "P1", "542")]);
        expect(g).toHaveLength(1);
        expect(g[0].title).toBe("Casa");
    });
});
