import { haversineMeters } from "@shared/geo/haversine";

import { displayCase, editDistanceAtMost1, normalizeText, tokens } from "./normalize";
import type { IndexStop, SearchIndex } from "./searchIndex";

export interface SearchItem {
    key: string;
    kind: "stop" | "corner" | "street";
    title: string;
    subtitle: string | null;
    stopId: string | null;
    lineCode: string | null;
    lineLabel: string | null;
    /** Para «street»/«corner»: consulta que expande ese resultado. */
    expandQuery: string | null;
}

export interface SearchResult {
    kind: "stops" | "corners" | "streets-of-line" | "empty";
    items: SearchItem[];
}

export interface SearchContext {
    favoriteStopIds?: Set<string>;
    near?: { lat: number; lng: number };
}

const MAX = 8;
const QUESTION_START = /^(como|cuando|donde|que|cual|cuanto|hay|puedo|me)\b/;

export function looksLikeQuestion(q: string): boolean {
    return q.trim().endsWith("?") || q.trim().startsWith("¿") || QUESTION_START.test(normalizeText(q));
}

function wordMatches(word: string, field: string): boolean {
    const parts = normalizeText(field).split(" ");
    return parts.some((p) => p.startsWith(word) || (word.length >= 5 && editDistanceAtMost1(word, p)));
}

/** Cada palabra de `words` aparece en la calle o en la intersección. */
function matchesCorner(stop: IndexStop, words: string[]): boolean {
    return words.every((w) => wordMatches(w, stop.street) || wordMatches(w, stop.cross));
}

function rank(stops: IndexStop[], ctx: SearchContext): IndexStop[] {
    return [...stops].sort((a, b) => {
        const fa = ctx.favoriteStopIds?.has(a.id) ? 0 : 1;
        const fb = ctx.favoriteStopIds?.has(b.id) ? 0 : 1;
        if (fa !== fb) return fa - fb;
        if (ctx.near) {
            return haversineMeters(ctx.near.lat, ctx.near.lng, a.lat, a.lng) - haversineMeters(ctx.near.lat, ctx.near.lng, b.lat, b.lng);
        }
        return `${a.street} ${a.cross}`.localeCompare(`${b.street} ${b.cross}`, "es");
    });
}

const cornerTitle = (s: IndexStop) => `${displayCase(s.street)} y ${displayCase(s.cross)}`;

/** Interpretaciones posibles de la consulta como «línea [+ resto]». Las de varias palabras van primero. */
function lineCandidates(index: SearchIndex, query: string, words: string[]): Array<{ code: string; label: string; rest: string[] }> {
    const byLabel = new Map(index.lines.map(([code, label]) => [normalizeText(label), { code, label }]));
    const norm = normalizeText(query);
    const out: Array<{ code: string; label: string; rest: string[] }> = [];
    const multi = [...byLabel.entries()].filter(([k]) => k.includes(" ")).sort((a, b) => b[0].length - a[0].length);
    for (const [k, v] of multi) {
        if (norm === k || norm.startsWith(`${k} `)) out.push({ ...v, rest: tokens(norm.slice(k.length)) });
    }
    const single = words.find((w) => byLabel.has(w));
    if (single) {
        const v = byLabel.get(single)!;
        const i = words.indexOf(single);
        out.push({ ...v, rest: words.filter((_, j) => j !== i) });
    }
    return out;
}

export function quickSearch(index: SearchIndex, query: string, ctx: SearchContext): SearchResult {
    const words = tokens(query);
    if (words.length === 0) return { kind: "empty", items: [] };

    // Un token es línea sólo si no queda resto o la búsqueda restringida a la línea da resultados
    // (si no, «12 de octubre» sería la línea 12 y no la calle).
    for (const { code, label, rest } of lineCandidates(index, query, words)) {
        const onLine = index.stops.filter((s) => s.lines.some(([c]) => c === code));
        if (rest.length === 0) {
            const streets = [...new Set(onLine.map((s) => s.street))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
            return {
                kind: "streets-of-line",
                items: streets.slice(0, MAX).map((street) => ({
                    key: `street:${code}:${street}`,
                    kind: "street",
                    title: displayCase(street),
                    subtitle: `Línea ${label}`,
                    stopId: null,
                    lineCode: code,
                    lineLabel: label,
                    expandQuery: `${label} ${street.toLowerCase()}`,
                })),
            };
        }
        const hits = rank(onLine.filter((s) => matchesCorner(s, rest)), ctx);
        if (hits.length === 0) continue;
        return {
            kind: "stops",
            items: hits.slice(0, MAX).map((s) => ({
                key: `stop:${s.id}:${code}`,
                kind: "stop",
                title: cornerTitle(s),
                subtitle: s.flag ? `→ ${displayCase(s.flag)}` : null,
                stopId: s.id,
                lineCode: code,
                lineLabel: label,
                expandQuery: null,
            })),
        };
    }

    const hits = rank(index.stops.filter((s) => matchesCorner(s, words)), ctx);
    if (hits.length === 0) return { kind: "empty", items: [] };
    const isCorner = words.length >= 2 && hits.every((s) => words.some((w) => wordMatches(w, s.cross)) && words.some((w) => wordMatches(w, s.street)));
    if (isCorner) {
        const items: SearchItem[] = [];
        for (const s of hits) {
            for (const [code, label] of [...s.lines].sort((a, b) => a[1].localeCompare(b[1], "es", { numeric: true }))) {
                items.push({ key: `stop:${s.id}:${code}`, kind: "stop", title: cornerTitle(s), subtitle: s.flag ? `→ ${displayCase(s.flag)}` : null, stopId: s.id, lineCode: code, lineLabel: label, expandQuery: null });
            }
        }
        return { kind: "stops", items: items.slice(0, MAX) };
    }
    return {
        kind: "corners",
        items: hits.slice(0, MAX).map((s) => ({
            key: `corner:${s.id}`,
            kind: "corner",
            title: cornerTitle(s),
            subtitle: s.lines.map(([, l]) => l).join(" · "),
            stopId: s.id,
            lineCode: s.lines.length === 1 ? s.lines[0][0] : null,
            lineLabel: s.lines.length === 1 ? s.lines[0][1] : null,
            expandQuery: `${s.street.toLowerCase()} ${s.cross.toLowerCase()}`,
        })),
    };
}
