#!/usr/bin/env node
/** Copia nombre de marca a los proyectos nativos. Idempotente. Uso: node scripts/apply-brand.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const brandSrc = readFileSync(resolve(root, "shared/brand.ts"), "utf8");
const pick = (key) => brandSrc.match(new RegExp(`${key}:\\s*"([^"]+)"`))?.[1];
const name = pick("name");
const shortName = pick("shortName");
if (!name || !shortName) throw new Error("No se pudo leer name/shortName de shared/brand.ts");

const xmlEscape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/'/g, "\\'");
function edit(rel, fn) {
    const p = resolve(root, rel);
    const before = readFileSync(p, "utf8");
    const after = fn(before);
    if (after !== before) writeFileSync(p, after);
    console.log(`${after === before ? "sin cambios" : "actualizado"}: ${rel}`);
}

edit("android/app/src/main/res/values/strings.xml", (s) =>
    s
        .replace(/(<string name="app_name">)[^<]*(<\/string>)/, `$1${xmlEscape(shortName)}$2`)
        .replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, `$1${xmlEscape(shortName)}$2`),
);
const plistName = (s) =>
    s.replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${shortName}$2`);
edit("ios/App/App/Info.plist", plistName);
edit("ios/App/BondiWidgetExtension/Info.plist", plistName);
edit("capacitor.config.ts", (s) => s.replace(/appName:\s*"[^"]*"/, `appName: "${shortName}"`));
