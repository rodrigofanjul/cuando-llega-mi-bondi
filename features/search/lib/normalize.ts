const ABBREVIATIONS: Record<string, string> = {
    av: "avenida",
    avda: "avenida",
    gral: "general",
    pte: "presidente",
    dr: "doctor",
    sta: "santa",
    sto: "santo",
};
const STOPWORDS = new Set(["y", "e", "esquina", "de", "con", "la", "el", "en", "calle", "parada"]);

export function normalizeText(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9ñ ]+/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => ABBREVIATIONS[w] ?? w)
        .join(" ");
}

/** Palabras significativas (sin conectores). */
export function tokens(s: string): string[] {
    return normalizeText(s).split(" ").filter((w) => w && !STOPWORDS.has(w));
}

export function editDistanceAtMost1(a: string, b: string): boolean {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    let j = 0;
    let edits = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            i++;
            j++;
            continue;
        }
        if (++edits > 1) return false;
        if (a.length > b.length) i++;
        else if (b.length > a.length) j++;
        else {
            i++;
            j++;
        }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
}

const LOWER_WORDS = new Set(["de", "del", "y", "la", "las", "los", "el"]);

/** «12 DE OCTUBRE» → «12 de Octubre» (para mostrar). */
export function displayCase(s: string): string {
    return s
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((w, i) => (i > 0 && LOWER_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
        .join(" ");
}
