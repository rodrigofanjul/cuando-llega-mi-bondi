/** Color estable por línea (no hay colores oficiales). Paleta con contraste AA texto/fondo. */
export interface LineColor {
    bg: string;
    fg: string;
}

export const LINE_PALETTE: readonly LineColor[] = [
    { bg: "#1d4ed8", fg: "#ffffff" },
    { bg: "#b91c1c", fg: "#ffffff" },
    { bg: "#047857", fg: "#ffffff" },
    { bg: "#7c3aed", fg: "#ffffff" },
    { bg: "#c2410c", fg: "#ffffff" },
    { bg: "#0e7490", fg: "#ffffff" },
    { bg: "#be185d", fg: "#ffffff" },
    { bg: "#4d7c0f", fg: "#ffffff" },
    { bg: "#a16207", fg: "#ffffff" },
    { bg: "#4338ca", fg: "#ffffff" },
    { bg: "#9f1239", fg: "#ffffff" },
    { bg: "#374151", fg: "#ffffff" },
];

export function lineColor(lineLabel: string): LineColor {
    const key = lineLabel.trim();
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return LINE_PALETTE[(h >>> 0) % LINE_PALETTE.length];
}
