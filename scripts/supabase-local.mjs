#!/usr/bin/env node
/**
 * Supabase LOCAL en Docker para desarrollo (no toca ningún proyecto en la nube).
 *
 *   node scripts/supabase-local.mjs start   # levanta, aplica migraciones y escribe .env.local
 *   node scripts/supabase-local.mjs stop    # detiene (los datos quedan en el volumen de Docker)
 *   node scripts/supabase-local.mjs reset   # BORRA los datos locales y reaplica migraciones
 *   node scripts/supabase-local.mjs status
 *
 * Trabaja en `.supabase-local/` (ignorado por git) con una copia de supabase/migrations.
 * Se omite 20260426120000_bus_locations_ramal.sql: modifica `bus_locations`, cuya definición
 * no está en el repo (docs/blockers.md B13).
 * Studio (panel web): http://127.0.0.1:54323
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const CLI = "supabase@2.122.1";
const ROOT = resolve(import.meta.dirname, "..");
const WORK = join(ROOT, ".supabase-local");
const SKIP = new Set(["20260426120000_bus_locations_ramal.sql"]);
const EXCLUDE = ["realtime", "storage-api", "imgproxy", "edge-runtime", "logflare", "vector", "supavisor"];
const ENV_FILE = join(ROOT, ".env.local");

function sb(args, { capture = false } = {}) {
    const r = spawnSync("npx", ["-y", CLI, ...args], {
        cwd: WORK,
        shell: process.platform === "win32",
        encoding: "utf8",
        stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });
    if (r.status !== 0) {
        console.error(`supabase ${args[0]} falló (código ${r.status}). ¿Docker está corriendo?`);
        process.exit(r.status ?? 1);
    }
    return r.stdout ?? "";
}

function prepare() {
    mkdirSync(WORK, { recursive: true });
    if (!existsSync(join(WORK, "supabase", "config.toml"))) {
        sb(["init", "--force"]);
        const cfg = join(WORK, "supabase", "config.toml");
        writeFileSync(cfg, readFileSync(cfg, "utf8").replace(/^project_id = .*$/m, 'project_id = "bondimdp-local"'));
    }
    const dest = join(WORK, "supabase", "migrations");
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => f.endsWith(".sql") && !SKIP.has(f));
    for (const f of files) copyFileSync(join(ROOT, "supabase", "migrations", f), join(dest, f));
    console.log(`Migraciones: ${files.length} (omitidas: ${[...SKIP].join(", ")})`);
}

/** Escribe sólo las variables de Supabase en .env.local; conserva el resto del archivo. */
function writeEnv() {
    const out = sb(["status", "-o", "env"], { capture: true });
    const vars = Object.fromEntries(
        out.split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)="?([^"]*)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]),
    );
    const secret = vars.SECRET_KEY || vars.SERVICE_ROLE_KEY;
    const publishable = vars.PUBLISHABLE_KEY || vars.ANON_KEY;
    if (!vars.API_URL || !secret || !publishable) {
        console.error("No se pudieron leer las claves locales (supabase status).");
        process.exit(1);
    }
    const managed = {
        NEXT_PUBLIC_SUPABASE_URL: vars.API_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable,
        SUPABASE_URL: vars.API_URL,
        SUPABASE_PUBLISHABLE_KEY: publishable,
        SUPABASE_SECRET_KEY: secret,
    };
    const kept = existsSync(ENV_FILE)
        ? readFileSync(ENV_FILE, "utf8").split(/\r?\n/).filter((l) => l && !Object.keys(managed).some((k) => l.startsWith(`${k}=`)) && !l.startsWith("# Supabase LOCAL"))
        : [];
    const block = ["# Supabase LOCAL (scripts/supabase-local.mjs) — sólo desarrollo", ...Object.entries(managed).map(([k, v]) => `${k}=${v}`)];
    writeFileSync(ENV_FILE, `${[...kept, ...block].join("\n")}\n`);
    console.log(`.env.local actualizado (${Object.keys(managed).join(", ")}). API ${vars.API_URL} · Studio ${vars.STUDIO_URL ?? "http://127.0.0.1:54323"}`);
}

const cmd = process.argv[2];
if (cmd === "start") {
    prepare();
    sb(["start", "-x", EXCLUDE.join(",")]);
    writeEnv();
} else if (cmd === "stop") {
    sb(["stop"]);
} else if (cmd === "reset") {
    prepare();
    sb(["db", "reset"]);
} else if (cmd === "status") {
    sb(["status"]);
} else {
    console.log("Uso: node scripts/supabase-local.mjs start|stop|reset|status");
    process.exit(2);
}
