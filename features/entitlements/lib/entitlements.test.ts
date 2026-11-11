import { afterEach, describe, expect, it, vi } from "vitest";

import { ALWAYS_FREE, FEATURES, NoopPurchaseProvider, currentEntitlements, hasFeature, limitsFor } from "./entitlements";

describe("entitlements", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("monetización apagada (default): todo habilitado y sin límites de free", () => {
        const s = currentEntitlements("free");
        expect(s.monetizationEnabled).toBe(false);
        expect(FEATURES.every((f) => hasFeature(s, f))).toBe(true);
        expect(limitsFor(s).asistentePorDia).toBe(100);
    });

    it("con monetización: lo existente sigue gratis; lo nuevo premium", () => {
        vi.stubEnv("NEXT_PUBLIC_MONETIZATION_ENABLED", "true");
        const free = currentEntitlements("free");
        for (const f of ALWAYS_FREE) expect(hasFeature(free, f)).toBe(true);
        expect(hasFeature(free, "estadisticas_historicas")).toBe(false);
        expect(hasFeature(currentEntitlements("premium"), "estadisticas_historicas")).toBe(true);
        expect(limitsFor(free).asistentePorDia).toBe(10);
    });

    it("las funciones existentes nunca son premium", () => {
        for (const f of ["consultar_arribos", "favoritos", "recorridos", "planificador"] as const) expect(ALWAYS_FREE.has(f)).toBe(true);
    });

    it("sin proveedor de compras no se cobra nada", async () => {
        const p = new NoopPurchaseProvider();
        expect(await p.products()).toEqual([]);
        expect(await p.purchase()).toEqual({ ok: false, reason: "unavailable" });
    });
});
