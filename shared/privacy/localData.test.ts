import { describe, expect, it } from "vitest";

import { clearAppData, listAppKeys } from "./localData";

function memoryStorage(init: Record<string, string>) {
    const data = new Map(Object.entries(init));
    return {
        get length() {
            return data.size;
        },
        key: (i: number) => [...data.keys()][i] ?? null,
        removeItem: (k: string) => void data.delete(k),
        keys: () => [...data.keys()],
    };
}

describe("datos locales", () => {
    it("lista y borra sólo claves propias de la app", () => {
        const s = memoryStorage({
            cuandollega_favoritos: "x",
            cuandollega_cache__RecuperarLineaPorCuandoLlega: "x",
            "bondi:habits": "x",
            "bondi:device-id": "x",
            "bondimdp:como-llego:recientes": "x",
            theme: "dark",
            "sb-abc-auth-token": "x",
        });
        expect(listAppKeys(s)).toEqual([
            "bondi:device-id",
            "bondi:habits",
            "bondimdp:como-llego:recientes",
            "cuandollega_cache__RecuperarLineaPorCuandoLlega",
            "cuandollega_favoritos",
        ]);
        expect(clearAppData(s)).toBe(5);
        expect(s.keys().sort()).toEqual(["sb-abc-auth-token", "theme"]);
    });
});
