#!/usr/bin/env node
/**
 * Exporta el histórico de Supabase al formato del pipeline ml/ (CSV, tiempos en
 * epoch ms, data_source=real). Sólo lectura; usa la clave de servicio del
 * entorno (nunca se guarda en el repo). Sin datos personales: las tablas no los tienen.
 *
 *   SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/export-arrival-history.mjs --out ml/data/real [--days 365]
 *
 * Salidas: arrivals.csv (inferred_arrivals) y observations.csv (arrival_observations).
 */
import { mkdirSync, createWriteStream } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(
    process.argv.slice(2).reduce((acc, v, i, all) => (v.startsWith("--") ? [...acc, [v.slice(2), all[i + 1]]] : acc), []),
);
const out = args.out;
const days = Number(args.days ?? 365);
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!out || !url || !key || !(days > 0)) {
    console.error("Uso: SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/export-arrival-history.mjs --out <dir> [--days N]");
    process.exit(2);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const since = new Date(Date.now() - days * 86_400_000).toISOString();
const PAGE = 1000;

const csvCell = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function dump(table, timeColumn, columns, mapRow, file) {
    const stream = createWriteStream(join(out, file), { encoding: "utf8" });
    stream.write(`${Object.keys(mapRow(Object.fromEntries(columns.map((c) => [c, null])))).join(",")}\n`);
    let total = 0;
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
            .from(table)
            .select(columns.join(","))
            .gte(timeColumn, since)
            .order(timeColumn, { ascending: true })
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1);
        if (error) throw new Error(`${table}: ${error.message}`);
        for (const r of data) stream.write(`${Object.values(mapRow(r)).map(csvCell).join(",")}\n`);
        total += data.length;
        if (data.length < PAGE) break;
    }
    await new Promise((r) => stream.end(r));
    return total;
}

const ms = (iso) => (iso ? Date.parse(iso) : null);

mkdirSync(out, { recursive: true });
const arrivals = await dump(
    "inferred_arrivals",
    "arrived_at",
    ["stop_id", "line_code", "vehicle_id", "arrived_at", "method", "confidence", "last_official_eta_minutes", "last_official_eta_at", "algorithm_version"],
    (r) => ({
        stop_id: r.stop_id,
        line_code: r.line_code,
        vehicle_id: r.vehicle_id,
        arrived_at: ms(r.arrived_at),
        method: r.method,
        confidence: r.confidence,
        last_official_eta_minutes: r.last_official_eta_minutes,
        last_official_eta_at: ms(r.last_official_eta_at),
        algorithm_version: r.algorithm_version,
        data_source: "real",
    }),
    "arrivals.csv",
);
const observations = await dump(
    "arrival_observations",
    "observed_at",
    ["observed_at", "stop_id", "line_code", "vehicle_id", "eta_minutes", "eta_status", "deviation_minutes"],
    (r) => ({
        observed_at: ms(r.observed_at),
        stop_id: r.stop_id,
        line_code: r.line_code,
        vehicle_id: r.vehicle_id,
        eta_minutes: r.eta_minutes,
        eta_status: r.eta_status,
        deviation_minutes: r.deviation_minutes,
        data_source: "real",
    }),
    "observations.csv",
);
console.log(JSON.stringify({ out, days, arrivals, observations }));
