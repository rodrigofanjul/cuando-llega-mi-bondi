import { describe, expect, it } from "vitest";

import { LINE_PALETTE, lineColor } from "./lineColor";

function luminance(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
};

describe("lineColor", () => {
    it("es estable y depende sólo del número de línea", () => {
        expect(lineColor("511")).toEqual(lineColor("511"));
        expect(lineColor(" 511 ")).toEqual(lineColor("511"));
    });

    it("distribuye líneas distintas en varios colores", () => {
        const used = new Set(["501", "511", "512", "521", "522", "523", "525", "531", "541", "542", "551", "552", "553", "555", "562", "563", "571", "573", "581", "591", "593"].map((l) => lineColor(l).bg));
        expect(used.size).toBeGreaterThanOrEqual(9);
    });

    it("todo color de la paleta tiene contraste AA con su texto", () => {
        for (const c of LINE_PALETTE) expect(contrast(c.bg, c.fg)).toBeGreaterThanOrEqual(4.5);
    });
});
