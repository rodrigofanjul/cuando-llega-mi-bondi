import { describe, expect, it } from "vitest";

import { BRAND, brandTitle } from "./brand";

describe("brand", () => {
    it("tiene los campos obligatorios no vacíos", () => {
        for (const key of ["name", "shortName", "domain", "appUrl", "accentColor", "description", "originalProjectCredit"] as const) {
            expect(BRAND[key].trim().length).toBeGreaterThan(0);
        }
        expect(BRAND.appUrl).toMatch(/^https?:\/\//);
        expect(BRAND.accentColor).toMatch(/^#[0-9a-f]{6}$/i);
        expect(BRAND.shortName.length).toBeLessThanOrEqual(12);
    });

    it("no usa la marca original", () => {
        const text = JSON.stringify(BRAND).toLowerCase();
        expect(text).not.toContain("bondi mdp");
        expect(text).not.toContain("bondimdp");
    });

    it("arma títulos de página", () => {
        expect(brandTitle()).toBe(BRAND.name);
        expect(brandTitle("Alertas")).toBe(`Alertas | ${BRAND.name}`);
    });
});
