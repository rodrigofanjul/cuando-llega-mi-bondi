#!/usr/bin/env node
/**
 * Deriva la línea de base de frecuencias para el modo offline desde el GTFS del
 * proyecto (public/gtfs). OJO: ese GTFS lo publica Bondi MDP (feed_info), NO es un
 * horario oficial; la UI lo presenta como «frecuencia publicada aproximada».
 *
 *   node scripts/build-frequency-baseline.mjs [public/gtfs] [public/offline/frequencies-v1.json]
 *
 * Salida: { source, generated_at, lines: { "<route_short_name>": [{ start, end, headwayMin }] } }
 * Con varios trips por línea en la misma franja se toma la MEDIANA del headway.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const [gtfsDir = "public/gtfs", out = "public/offline/frequencies-v1.json"] = process.argv.slice(2);

function csv(file) {
    const [header, ...rows] = readFileSync(join(gtfsDir, file), "utf8").trim().split(/\r?\n/);
    const cols = header.split(",");
    return rows.map((r) => Object.fromEntries(r.split(",").map((v, i) => [cols[i], v])));
}

const toMin = (hms) => {
    const [h, m] = hms.split(":").map(Number);
    return h * 60 + m;
};

const routeName = new Map(csv("routes.txt").map((r) => [r.route_id, r.route_short_name]));
const tripRoute = new Map(csv("trips.txt").map((t) => [t.trip_id, t.route_id]));
const windows = new Map(); // line -> "start|end" -> headways[]
for (const f of csv("frequencies.txt")) {
    const line = routeName.get(tripRoute.get(f.trip_id));
    if (!line) continue;
    const key = `${toMin(f.start_time)}|${Math.min(1440, toMin(f.end_time))}`;
    const perLine = windows.get(line) ?? new Map();
    perLine.set(key, [...(perLine.get(key) ?? []), Number(f.headway_secs) / 60]);
    windows.set(line, perLine);
}

const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
};

const lines = {};
for (const [line, perLine] of [...windows].sort(([a], [b]) => a.localeCompare(b))) {
    lines[line] = [...perLine]
        .map(([k, hs]) => {
            const [start, end] = k.split("|").map(Number);
            return { start, end, headwayMin: Math.round(median(hs)) };
        })
        .filter((w) => w.end > w.start)
        .sort((a, b) => a.start - b.start);
}

const feed = csv("feed_info.txt")[0] ?? {};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
    out,
    JSON.stringify({ source: `GTFS publicado por ${feed.feed_publisher_name ?? "el proyecto"} (no oficial), versión ${feed.feed_version ?? "?"}`, generated_at: new Date().toISOString(), lines }),
);
console.log(`${out}: ${Object.keys(lines).length} líneas`);
