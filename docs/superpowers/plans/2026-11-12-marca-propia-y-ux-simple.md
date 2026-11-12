# Marca propia y experiencia simple — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la app en una marca propia configurable y rediseñar Inicio para ver cuándo llega el colectivo en ≤ 2 toques (spec: `docs/superpowers/specs/2026-11-12-marca-propia-y-ux-simple-design.md`).

**Architecture:** Next.js 16 App Router (Cache Components, React Compiler, Tailwind 4, zustand, SWR). La marca vive en `shared/brand.ts`. La búsqueda usa un índice compacto servido por `/api/search-index` (derivado del catálogo `ParadaGeo` que ya existe en `lib/server/transitStaticModels.ts`) y un motor puro en el cliente. Inicio vive en `app/(main)/page.tsx` para reutilizar el panel de arribos existente (`ArrivalsOverlay`), que se abre con `useSearchFlowStore.getState().resetToParada(paradaId, codLinea, { consulting: true })`.

**Tech Stack:** TypeScript, React 19, Next.js 16.4, Tailwind 4, zustand, SWR, zod 3, vitest 4.

---

## Reglas para quien implementa (leer antes de cada tarea)

- Directorio del repo: `E:\Repositorios\CuandoLlega`. Rama: `feature/next-gen-platform`. **Commits y push sólo al fork** (`origin`). Nunca tocar `upstream`.
- **NO modificar** `shared/api/client.ts`, `app/api/mgp/*`, `lib/server/mgpDirect.ts`, `.github/workflows/probe-v670.yml` (decisión del dueño). Tampoco `.env.local`.
- **Claves de almacenamiento local no cambian** (`cuandollega_favoritos`, `bondi:*`, `bondimdp:*`): cambiarlas borraría datos de usuarios.
- Tests: correr vitest **desde PowerShell** con ruta en mayúscula: `cd E:\Repositorios\CuandoLlega; npx vitest run <ruta>`. Desde Git Bash con `/e/...` falla por un problema de mayúsculas del disco.
- Typecheck: `npx tsc --noEmit -p .` → exit 0. Lint de lo tocado: `npx eslint <archivos>` → exit 0.
- Fallos preexistentes que **no** hay que arreglar: 10 tests en `shared/api/client.test.ts` (B7) y 2 errores de eslint en `app/anunciate/exito` y `PlayStorePromo` (desaparecen en la Tarea 4/5 al borrar esos archivos).
- React Compiler está activo: no llamar `Date.now()` durante el render; usar estado inicializado perezosamente + intervalos, como `ArrivalsPanel.tsx` (`useState(() => Date.now())` + `setInterval`).
- Textos de UI en español rioplatense. Commits terminan con: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Mensajes de commit: escribirlos a un archivo y usar `git commit -F <archivo>` (PowerShell 5.1 no pasa here-strings por stdin).

## Mapa de archivos

| Archivo | Responsabilidad |
| ------- | --------------- |
| `shared/brand.ts` (+test) | Única fuente de nombre, dominio, colores, contacto, crédito |
| `app/manifest.ts` | Manifest PWA desde `brand.ts` (reemplaza `public/manifest.json`) |
| `scripts/apply-brand.mjs` | Copia la marca a Capacitor, Android e iOS |
| `features/brand/lineColor.ts` (+test) | Color estable por línea |
| `features/arrivals/lib/arrivalDisplay.ts` (+test) | Estado de confianza de un arribo → texto y etiqueta accesible |
| `features/arrivals/components/ArrivalTime.tsx` | Componente único para mostrar minutos |
| `features/search/lib/searchIndex.ts` (+test) | Construcción del índice compacto desde `ParadaGeo[]` |
| `app/api/search-index/route.ts` | Sirve el índice |
| `features/search/lib/normalize.ts` (+test) | Normalización de texto, abreviaturas, distancia de edición |
| `features/search/lib/quickSearch.ts` (+test) | Motor de búsqueda puro |
| `features/search/hooks/useSearchIndex.ts` | Descarga y cachea el índice |
| `features/home/lib/corners.ts` (+test) | Agrupa favoritos por esquina |
| `features/home/lib/nowCard.ts` (+test) | Elige la tarjeta «Ahora» |
| `features/home/hooks/usePairArrivals.ts` | Arribos en vivo de un par (parada, línea) |
| `features/home/components/*` | `HomeScreen`, `NowCard`, `CornerCard`, `SearchBar`, `SearchResults` |
| `features/alerts/lib/quickAlert.ts` (+test) | Alerta de un toque |
| `features/arrivals/components/StopActionBar.tsx` | ♥ Guardar · 🔔 Avisarme · ↗ Compartir |
| `app/(main)/page.tsx` | Inicio |
| `app/(main)/viajes/page.tsx`, `app/(main)/mas/page.tsx` | Pestañas nuevas |
| `shared/layout/BottomNav.tsx` | 3 pestañas |
| `shared/display/useDisplayPrefs.ts` | Alto contraste |

---

### Task 1: Configuración de marca

**Files:**
- Create: `shared/brand.ts`
- Test: `shared/brand.test.ts`

- [ ] **Step 1: Write the failing test** — `shared/brand.test.ts`

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/brand.test.ts` → FAIL («Cannot find module './brand'»).

- [ ] **Step 3: Write minimal implementation** — `shared/brand.ts`

```ts
/**
 * Marca de la app: ÚNICA fuente de nombre, dominio y colores. Cambiar el nombre
 * = editar este archivo y correr `node scripts/apply-brand.mjs` (nativos).
 * Nombre provisorio hasta que el dueño elija uno (spec 2026-11-12).
 */
export const BRAND = {
    name: "Cuándo Viene",
    shortName: "Cuándo Viene",
    /** Identificador técnico sin espacios ni tildes (paquetes, archivos). */
    slug: "cuando-viene",
    domain: "localhost",
    appUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000",
    accentColor: "#1f6feb",
    backgroundLight: "#f7f7f4",
    backgroundDark: "#0f172a",
    contactEmail: "",
    city: "Mar del Plata",
    description: "Cuándo llega tu colectivo en Mar del Plata, al instante.",
    originalProjectCredit:
        "Basada en el proyecto de código abierto «Cuándo llega mi bondi» (licencia MIT, © 2026 Celiz & Contributors).",
} as const;

export function brandTitle(page?: string): string {
    return page ? `${page} | ${BRAND.name}` : BRAND.name;
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run shared/brand.test.ts` → 3 passed.

- [ ] **Step 5: Commit** — `git add shared/brand.ts shared/brand.test.ts` · mensaje `feat(marca): configuración de marca en un solo archivo`.

---

### Task 2: Quitar publicidad, pagos de anunciantes y rastreo

**Files:**
- Delete: `shared/ads/` (todo), `shared/analytics/` (todo), `features/sponsors/` (todo), `lib/mercadopago/` (todo), `app/api/ads/` (todo), `app/anunciate/` (todo), `app/anunciantes/` (todo)
- Modify: `app/layout.tsx`, `features/arrivals/components/ArrivalsPanel.tsx`, todo archivo que importe lo borrado, `package.json`, `bun.lock`, `next.config.ts`, `lib/server/supabaseAdmin.ts`

- [ ] **Step 1: Listar dependencias a cortar**

Run (PowerShell): `Get-ChildItem -Recurse -Include *.ts,*.tsx -Path app,features,shared,lib | Select-String -Pattern "@shared/ads|@shared/analytics|@features/sponsors|mercadopago|AdSense|SponsorSlot|isAdCheckoutConfigured" -List | % Path`
Anotar la lista: cada archivo listado que **no** se borra en este paso debe quedar sin esas importaciones.

- [ ] **Step 2: Borrar carpetas**

```powershell
cd E:\Repositorios\CuandoLlega
git rm -r -q shared/ads shared/analytics features/sponsors lib/mercadopago app/api/ads app/anunciate app/anunciantes
```

- [ ] **Step 3: Limpiar `app/layout.tsx`**

Quitar los imports y usos de `GoogleAnalyticsDeferred`, `MicrosoftClarityDeferred`, `VercelAnalyticsDeferred`, `ADSENSE_CLIENT` y el bloque `other: { "google-adsense-account": ... }` de `metadata`. (La marca de los metadatos se cambia en la Tarea 3.)

- [ ] **Step 4: Limpiar el panel de arribos**

En `features/arrivals/components/ArrivalsPanel.tsx`: borrar `import { AdSenseRail } ...`, la constante `ADSENSE_SLOT_ARRIVALS` y el bloque `{isConsulting ? <AdSenseRail slot={ADSENSE_SLOT_ARRIVALS} /> : null}` con su comentario.
Repetir en cada archivo de la lista del Step 1 (p. ej. `SponsorSlot` en Favoritos/Recorrido, `AdSenseUnit` en otras pantallas): quitar import y el JSX que lo usa, sin dejar contenedores vacíos.

- [ ] **Step 5: `isAdCheckoutConfigured`**

En `lib/server/supabaseAdmin.ts` borrar la función `isAdCheckoutConfigured` (sólo la usaban los anuncios).

- [ ] **Step 6: Dependencias**

En `package.json` quitar `mercadopago`, `@vercel/analytics` y `@next/third-parties` **sólo si** después del Step 4 no quedan imports (`Select-String -Path package.json -Pattern ...` y el grep del Step 1 vacío). Regenerar el lock:

```powershell
$s="$env:TEMP\claude\bunlock"; New-Item -ItemType Directory -Force $s | Out-Null
Copy-Item package.json,bun.lock $s; Push-Location $s; npx -y bun@1.2.18 install --lockfile-only; Pop-Location
Copy-Item "$s\bun.lock" .\bun.lock -Force
cmd /c "rd /s /q node_modules"; npm install --no-audit --no-fund
```

- [ ] **Step 7: CSP comment**

En `next.config.ts`, actualizar el comentario de CSP: ya no hay AdSense/GA/Clarity (queda OSM, mosaicos y Supabase).

- [ ] **Step 8: Verificar**

Run: el grep del Step 1 → sin resultados. `npx tsc --noEmit -p .` → exit 0. `npx vitest run` → mismos 10 fallos preexistentes (B7) y nada más (los tests de `features/sponsors` se borraron con la carpeta).

- [ ] **Step 9: Commit** — mensaje `refactor: quitar publicidad, anunciantes con pagos y rastreadores de terceros`.

---

### Task 3: Aplicar la marca a la web y quitar contenido de la marca original

**Files:**
- Delete: `features/landing/`, `features/blog/`, `app/blog/`, `app/un-mes-en-numeros/`, `app/primer-trimestre-en-numeros/`, `app/android/`, `app/contacto/`, `shared/layout/PlayStorePromo.tsx`, `shared/layout/PlayStoreNavLink.tsx`, `shared/play/`, `public/manifest.json`, `public/llms.txt`, `public/llms-full.txt` (si existen), `app/page.tsx`
- Create: `app/manifest.ts`
- Modify: `app/layout.tsx`, `shared/seo/JsonLd.tsx`, `shared/seo/markdownPages.ts` (o borrar si sólo lo usa el blog/landing), `app/sitemap.ts`, `app/robots.ts`, `app/acerca/*`, `app/privacidad/page.tsx`, `app/terminos/page.tsx`, `app/not-found.tsx`, `shared/layout/Footer.tsx`, `shared/layout/Header.tsx`, `shared/layout/BottomNav.tsx` (sólo textos; la estructura cambia en Tarea 12), `shared/ui/BrandLogo.tsx`, `mobile/www/offline.html`, `features/assistant/lib/anthropicProvider.ts`, `features/alerts/components/AlertsClient.tsx`, `next.config.ts`

- [ ] **Step 1: Borrar contenido**

```powershell
git rm -r -q features/landing features/blog app/blog app/un-mes-en-numeros app/primer-trimestre-en-numeros app/android app/contacto shared/layout/PlayStorePromo.tsx shared/layout/PlayStoreNavLink.tsx shared/play app/page.tsx public/manifest.json
foreach ($f in "public/llms.txt","public/llms-full.txt") { if (Test-Path $f) { git rm -q $f } }
```

(`app/page.tsx` se reemplaza por `app/(main)/page.tsx` en la Tarea 11; hasta entonces `/` responde 404 — es esperado.)

- [ ] **Step 2: Manifest desde la marca** — `app/manifest.ts`

```ts
import type { MetadataRoute } from "next";

import { BRAND } from "@shared/brand";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: BRAND.name,
        short_name: BRAND.shortName,
        description: BRAND.description,
        start_url: "/",
        display: "standalone",
        background_color: BRAND.backgroundLight,
        theme_color: BRAND.accentColor,
        lang: "es-AR",
        icons: [
            { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
            { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
        ],
    };
}
```

- [ ] **Step 3: `app/layout.tsx`**

Reemplazar `metadata` y `viewport` por:

```ts
export const metadata: Metadata = {
    metadataBase: new URL(BRAND.appUrl),
    title: { default: `${BRAND.name} — ${BRAND.description}`, template: `%s | ${BRAND.name}` },
    description: BRAND.description,
    alternates: { canonical: "/" },
    openGraph: { type: "website", locale: "es_AR", url: BRAND.appUrl, title: BRAND.name, description: BRAND.description, siteName: BRAND.name },
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: BRAND.shortName },
    icons: {
        icon: [
            { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
            { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
        ],
        apple: "/apple-icon.png",
        shortcut: "/favicon.ico",
    },
};

export const viewport: Viewport = {
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: BRAND.backgroundLight },
        { media: "(prefers-color-scheme: dark)", color: BRAND.backgroundDark },
    ],
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
};
```

Agregar `import { BRAND } from "@shared/brand";`, quitar `manifest: "/manifest.json"` (Next lo toma de `app/manifest.ts`), quitar `verification`, `keywords`, `twitter`, y del JSX `<PlayStorePromo />`.

- [ ] **Step 4: SEO**

- `shared/seo/JsonLd.tsx`: dejar sólo un `WebApplication` con `name: BRAND.name`, `url: BRAND.appUrl`, `description: BRAND.description`, `applicationCategory: "TravelApplication"`, `inLanguage: "es-AR"`, `offers` gratis. Sin `Organization`, redes ni reseñas.
- `shared/seo/markdownPages.ts`: si sólo lo usan páginas borradas, `git rm`; si no, reemplazar «Bondi MDP» por `BRAND.name`.
- `app/sitemap.ts`: `BRAND.appUrl` como base; listar `/`, `/viajes`, `/mas`, `/recorrido`, `/recorrido/<linea>` (como hoy), `/acerca`, `/privacidad`, `/terminos`.
- `app/robots.ts`: `sitemap: \`${BRAND.appUrl}/sitemap.xml\``.
- `next.config.ts`: borrar el bloque `headers()` para `/` (Link a llms) y los redirects a páginas borradas; agregar redirects permanentes: `/blog/:path*`, `/un-mes-en-numeros`, `/primer-trimestre-en-numeros`, `/android`, `/anunciate/:path*`, `/anunciantes` → `/`; `/contacto` y `/contact` → `/acerca`.

- [ ] **Step 5: Textos de marca**

Reemplazar toda aparición de «Bondi MDP», «BondiMDP», «bondimdp» y «bondi mdp» en `app/`, `features/`, `shared/`, `lib/`, `mobile/www/offline.html` por `BRAND.name` (en TSX: importar `BRAND`) o, en archivos estáticos (`offline.html`), por el texto literal `Cuándo Viene` con un comentario `<!-- ver shared/brand.ts -->`.
Excepciones: claves de almacenamiento (`bondi:*`, `bondimdp:*`), nombres de archivos/identificadores técnicos (`com.bondimdp.mobile` en Kotlin: lo maneja la Tarea 4), y `shared/api/client.ts`/`app/api/mgp/*` (prohibido tocar).

- [ ] **Step 6: Páginas que quedan**

- `app/acerca/page.tsx` + `AcercaClient.tsx`: una sola pantalla con `BRAND.name`, `BRAND.description`, `BRAND.originalProjectCredit`, enlace a `/privacidad` y `/terminos`, y `BRAND.contactEmail` sólo si no está vacío. Sin autores, prensa ni estadísticas.
- `app/privacidad/page.tsx`: nombre desde `BRAND`; quitar secciones de AdSense, Google Analytics, Clarity, Vercel Analytics y MercadoPago; mantener ubicación (no se guarda), datos locales y borrado, observaciones anónimas (desactivadas por defecto), asistente (no guarda conversaciones).
- `app/terminos/page.tsx`: nombre desde `BRAND`; quitar secciones de anuncios y pagos.
- `app/not-found.tsx`, `Footer.tsx`, `Header.tsx`, `BrandLogo.tsx`: nombre desde `BRAND`. `BrandLogo` muestra `BRAND.shortName` en texto (sin logo de la marca original).

- [ ] **Step 7: LICENSE**

Agregar al final de `LICENSE` una línea `Copyright (c) 2026 <titular del fork>` **sin** borrar la línea original. Usar como titular `rodrigofanjul` (usuario del fork).

- [ ] **Step 8: Verificar**

Run: `git grep -n -i -E "bondi ?mdp|bondimdp" -- app features shared lib mobile public ':!*.json'` → sólo claves de almacenamiento (`bondimdp:`), y nada en textos visibles. `npx tsc --noEmit -p .` → 0. `npx vitest run` → sólo B7. Ajustar tests que esperaban «Bondi MDP» (`shared/privacy/localData.test.ts`, `features/widgets/native/bridge.test.ts`, etc.) para usar `BRAND.name` o el valor técnico correspondiente.

- [ ] **Step 9: Commit** — `feat(marca): aplicar marca configurable y quitar contenido de la marca original`.

---

### Task 4: Marca en los nativos

**Files:**
- Create: `scripts/apply-brand.mjs`
- Modify: `capacitor.config.ts`, `android/app/src/main/res/values/strings.xml`, `ios/App/App/Info.plist`, `ios/App/BondiWidgetExtension/BondiWidget.swift` (textos), `android/app/src/main/java/com/bondimdp/mobile/widget/BondiWidget.kt` (textos)

- [ ] **Step 1: Script** — `scripts/apply-brand.mjs`

```js
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
edit("ios/App/App/Info.plist", (s) =>
    s.replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${shortName}$2`),
);
edit("capacitor.config.ts", (s) => s.replace(/appName:\s*"[^"]*"/, `appName: "${shortName}"`));
```

- [ ] **Step 2: Ejecutar dos veces**

Run: `node scripts/apply-brand.mjs` → «actualizado» en los 3 archivos. Segunda vez → «sin cambios» en los 3 (idempotente). Si `strings.xml` no tiene `title_activity_main`, la línea simplemente no cambia.

- [ ] **Step 3: Textos visibles del widget**

- Kotlin (`BondiWidget.kt`): el texto `"Bondi MDP"` del estado sin configurar → `context.getString(R.string.app_name)`.
- Swift (`BondiWidget.swift`): `Text("Bondi MDP")` → `Text(Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "")`; `.configurationDisplayName("Próximo bondi")` → `"Próximo colectivo"`.
No cambiar identificadores de paquete (`com.bondimdp.mobile`, `applicationId`): se definen al publicar (B4/B6).

- [ ] **Step 4: Verificar Android**

```powershell
cd E:\Repositorios\CuandoLlega\android
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-21.0.13.9-hotspot'; $env:ANDROID_HOME='C:\Android\sdk'
.\gradlew.bat testDebugUnitTest assembleDebug --console=plain -q
```
Expected: exit 0, 18 tests OK. (iOS se verifica en CI.)

- [ ] **Step 5: Commit** — `feat(marca): nombre de la app en Android, iOS y Capacitor desde shared/brand.ts`.

---

### Task 5: Color estable por línea

**Files:**
- Create: `features/brand/lineColor.ts`
- Test: `features/brand/lineColor.test.ts`

- [ ] **Step 1: Failing test**

```ts
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
```

- [ ] **Step 2:** `npx vitest run features/brand/lineColor.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementación**

```ts
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
```

- [ ] **Step 4:** test → 3 passed. Si el test de distribución falla (< 9 colores), cambiar sólo el orden de la paleta hasta pasar; no bajar el umbral.

- [ ] **Step 5: Commit** — `feat(ui): color estable por línea con contraste AA`.

---

### Task 6: Estados de confianza y `ArrivalTime`

**Files:**
- Create: `features/arrivals/lib/arrivalDisplay.ts`, `features/arrivals/components/ArrivalTime.tsx`
- Test: `features/arrivals/lib/arrivalDisplay.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";

import { arrivalDisplay } from "./arrivalDisplay";

const T = Date.parse("2026-11-12T12:00:00Z"); // 09:00 en MDP
const MIN = 60_000;

describe("arrivalDisplay", () => {
    it("en vivo con minutos proyectados", () => {
        const d = arrivalDisplay({ kind: "live", etaMinutes: 5, arriving: false, fetchedAt: T - MIN, now: T });
        expect(d).toMatchObject({ state: "live", text: "4 min", pulse: true });
        expect(d.spoken).toBe("llega en 4 minutos");
    });

    it("llegando", () => {
        const d = arrivalDisplay({ kind: "live", etaMinutes: 0, arriving: true, fetchedAt: T, now: T });
        expect(d).toMatchObject({ state: "arriving", text: "Llegando", spoken: "está llegando" });
    });

    it("menos de un minuto", () => {
        expect(arrivalDisplay({ kind: "live", etaMinutes: 0, arriving: false, fetchedAt: T, now: T }).text).toBe("< 1 min");
    });

    it("envejeciendo muestra la antigüedad", () => {
        const d = arrivalDisplay({ kind: "live", etaMinutes: 12, arriving: false, fetchedAt: T - 4 * MIN, now: T });
        expect(d).toMatchObject({ state: "aging", text: "8 min", note: "hace 4 min", pulse: false });
    });

    it("vencido nunca muestra minutos", () => {
        const d = arrivalDisplay({ kind: "live", etaMinutes: 12, arriving: false, fetchedAt: T - 15 * MIN, now: T });
        expect(d.state).toBe("stale");
        expect(d.text).toBe("Dato de las 08:45");
        expect(d.spoken).toBe("dato vencido de las 08:45");
    });

    it("estimación histórica", () => {
        const d = arrivalDisplay({ kind: "historical", medianMin: 7, highMin: 17 });
        expect(d).toMatchObject({ state: "historical", text: "≈ 7 min", note: "histórico · hasta 17" });
        expect(d.spoken).toBe("estimación histórica, alrededor de 7 minutos");
    });

    it("sin servicio con frecuencia publicada", () => {
        expect(arrivalDisplay({ kind: "none", headwayMin: 12 })).toMatchObject({ state: "none", text: "Sin arribos ahora", note: "pasa cada ~12 min" });
        expect(arrivalDisplay({ kind: "none", headwayMin: null }).note).toBeNull();
    });

    it("singular de minuto", () => {
        expect(arrivalDisplay({ kind: "live", etaMinutes: 1, arriving: false, fetchedAt: T, now: T }).spoken).toBe("llega en 1 minuto");
    });
});
```

- [ ] **Step 2:** `npx vitest run features/arrivals/lib/arrivalDisplay.test.ts` → FAIL.

- [ ] **Step 3: Implementación** — `features/arrivals/lib/arrivalDisplay.ts`

```ts
import { freshnessOf, projectEtaMinutes } from "@features/arrivals/lib/freshness";
import { formatArClock } from "@shared/time/argentina";

export type ArrivalInput =
    | { kind: "live"; etaMinutes: number | null; arriving: boolean; fetchedAt: number; now: number }
    | { kind: "historical"; medianMin: number; highMin: number }
    | { kind: "none"; headwayMin: number | null };

export interface ArrivalView {
    state: "live" | "aging" | "stale" | "arriving" | "historical" | "none";
    text: string;
    note: string | null;
    spoken: string;
    pulse: boolean;
}

const minutes = (m: number) => (m === 1 ? "1 minuto" : `${m} minutos`);

/** Única regla de presentación de un arribo (spec §7). Nunca muestra viejo/estimado como en vivo. */
export function arrivalDisplay(input: ArrivalInput): ArrivalView {
    if (input.kind === "historical") {
        return {
            state: "historical",
            text: `≈ ${input.medianMin} min`,
            note: `histórico · hasta ${input.highMin}`,
            spoken: `estimación histórica, alrededor de ${minutes(input.medianMin)}`,
            pulse: false,
        };
    }
    if (input.kind === "none") {
        return {
            state: "none",
            text: "Sin arribos ahora",
            note: input.headwayMin !== null ? `pasa cada ~${input.headwayMin} min` : null,
            spoken: "sin arribos informados ahora",
            pulse: false,
        };
    }
    const freshness = freshnessOf(input.fetchedAt, input.now);
    if (freshness === "stale") {
        const clock = formatArClock(input.fetchedAt);
        return { state: "stale", text: `Dato de las ${clock}`, note: null, spoken: `dato vencido de las ${clock}`, pulse: false };
    }
    const eta = projectEtaMinutes(input.etaMinutes, input.fetchedAt, input.now);
    const ageMin = Math.floor((input.now - input.fetchedAt) / 60_000);
    const note = freshness === "aging" ? `hace ${ageMin} min` : null;
    if (input.arriving && (eta === null || eta === 0)) {
        return { state: "arriving", text: "Llegando", note, spoken: "está llegando", pulse: freshness === "fresh" };
    }
    if (eta === null) {
        return { state: "none", text: "Sin arribos ahora", note, spoken: "sin arribos informados ahora", pulse: false };
    }
    return {
        state: freshness === "fresh" ? "live" : "aging",
        text: eta === 0 ? "< 1 min" : `${eta} min`,
        note,
        spoken: eta === 0 ? "llega en menos de un minuto" : `llega en ${minutes(eta)}`,
        pulse: freshness === "fresh",
    };
}
```

- [ ] **Step 4:** test → 8 passed. Si `formatArClock` devuelve otro formato que `HH:MM`, revisar `shared/time/argentina.ts` y ajustar la expectativa **sólo** si el formato real es equivalente (p. ej. «8:45» vs «08:45»).

- [ ] **Step 5: Componente** — `features/arrivals/components/ArrivalTime.tsx`

```tsx
"use client";

import { arrivalDisplay, type ArrivalInput } from "@features/arrivals/lib/arrivalDisplay";
import { cn } from "@shared/utils";

interface Props {
    readonly input: ArrivalInput;
    readonly size?: "hero" | "row";
    readonly className?: string;
}

/** Minutos con su estado de confianza (spec §7). `hero` = 56 px, `row` = 20 px. */
export function ArrivalTime({ input, size = "row", className }: Props) {
    const v = arrivalDisplay(input);
    const muted = v.state === "stale" || v.state === "historical" || v.state === "none";
    return (
        <span className={cn("inline-flex flex-col items-end leading-none", className)} aria-label={v.spoken} role="text">
            <span
                className={cn(
                    "inline-flex items-center gap-1.5 font-bold tabular-nums",
                    size === "hero" ? "text-[56px] tracking-tight" : "text-[20px]",
                    muted ? "text-muted-foreground" : "text-accent",
                    v.state === "stale" && "text-[15px] font-semibold",
                )}
                aria-hidden="true"
            >
                {v.pulse ? <span className="live-dot h-2 w-2 rounded-full bg-success" /> : null}
                {v.text}
            </span>
            {v.note ? (
                <span className="mt-1 text-[11px] font-medium text-muted-foreground" aria-hidden="true">
                    {v.note}
                </span>
            ) : null}
        </span>
    );
}
```

En `app/globals.css` agregar:

```css
@keyframes live-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.live-dot { animation: live-pulse 2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .live-dot { animation: none; } }
```

- [ ] **Step 6:** `npx tsc --noEmit -p .` → 0. **Commit** — `feat(ui): estados de confianza de arribos en un solo componente`.

---

### Task 7: Índice de búsqueda

**Files:**
- Create: `features/search/lib/searchIndex.ts`, `app/api/search-index/route.ts`
- Test: `features/search/lib/searchIndex.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";

import type { ParadaGeo } from "@features/trip-planner/types";

import { buildSearchIndex, SEARCH_INDEX_VERSION } from "./searchIndex";

const paradas: ParadaGeo[] = [
    { identificador: "10101", lat: -38.0001, lng: -57.5501, abreviaturaBandera: "A PUERTO", calleLabel: "12 DE OCTUBRE - MAR DEL PLATA", interseccionLabel: "ACHA - MAR DEL PLATA", lineas: [{ codigoLineaParada: "98", descripcion: "511" }] },
    { identificador: "10102", lat: -38.0002, lng: -57.5502, abreviaturaBandera: null, calleLabel: "LURO - MAR DEL PLATA", interseccionLabel: "SALTA - MAR DEL PLATA", lineas: [{ codigoLineaParada: "98", descripcion: "511" }, { codigoLineaParada: "120", descripcion: "542" }] },
    { identificador: "SIN", lat: -38, lng: -57.5, abreviaturaBandera: null, calleLabel: null, interseccionLabel: null, lineas: [] },
];

describe("buildSearchIndex", () => {
    const idx = buildSearchIndex(paradas, "2026-11-12");

    it("tiene versión y fecha", () => {
        expect(idx.v).toBe(SEARCH_INDEX_VERSION);
        expect(idx.generatedAt).toBe("2026-11-12");
    });

    it("limpia el sufijo de ciudad y redondea coordenadas a 5 decimales", () => {
        expect(idx.stops[0]).toEqual({ id: "10101", street: "12 DE OCTUBRE", cross: "ACHA", lat: -38.0001, lng: -57.5501, flag: "A PUERTO", lines: [["98", "511"]] });
    });

    it("descarta paradas sin calle o sin líneas", () => {
        expect(idx.stops.map((s) => s.id)).toEqual(["10101", "10102"]);
    });

    it("lista líneas únicas ordenadas por número visible", () => {
        expect(idx.lines).toEqual([["98", "511"], ["120", "542"]]);
    });
});
```

- [ ] **Step 2:** FAIL (módulo inexistente).

- [ ] **Step 3: Implementación** — `features/search/lib/searchIndex.ts`

```ts
import type { ParadaGeo } from "@features/trip-planner/types";

export const SEARCH_INDEX_VERSION = 1 as const;

/** [codigoLineaParada, número visible] */
export type IndexLine = [string, string];

export interface IndexStop {
    id: string;
    street: string;
    cross: string;
    lat: number;
    lng: number;
    flag: string | null;
    lines: IndexLine[];
}

export interface SearchIndex {
    v: typeof SEARCH_INDEX_VERSION;
    generatedAt: string;
    lines: IndexLine[];
    stops: IndexStop[];
}

const cleanStreet = (s: string) => s.replace(/\s*-\s*MAR DEL PLATA\s*$/i, "").trim();
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function buildSearchIndex(paradas: ParadaGeo[], generatedAt: string): SearchIndex {
    const lines = new Map<string, string>();
    const stops: IndexStop[] = [];
    for (const p of paradas) {
        if (!p.calleLabel || !p.interseccionLabel || p.lineas.length === 0) continue;
        const ls: IndexLine[] = p.lineas.map((l) => [l.codigoLineaParada, l.descripcion]);
        for (const [code, label] of ls) lines.set(code, label);
        stops.push({
            id: p.identificador,
            street: cleanStreet(p.calleLabel),
            cross: cleanStreet(p.interseccionLabel),
            lat: round5(p.lat),
            lng: round5(p.lng),
            flag: p.abreviaturaBandera,
            lines: ls,
        });
    }
    const sorted = [...lines.entries()].sort((a, b) => a[1].localeCompare(b[1], "es", { numeric: true })) as IndexLine[];
    return { v: SEARCH_INDEX_VERSION, generatedAt, lines: sorted, stops };
}
```

- [ ] **Step 4:** test → 4 passed.

- [ ] **Step 5: Ruta** — `app/api/search-index/route.ts`

```ts
import { NextResponse } from "next/server";

import { buildSearchIndex } from "@features/search/lib/searchIndex";
import { getTransitStaticModels } from "@/lib/server/transitStaticModels";

/** Índice compacto para la búsqueda local (sólo datos de referencia, sin consultas en vivo). */
export async function GET() {
    const { paradas } = await getTransitStaticModels();
    if (paradas.length === 0) return NextResponse.json({ error: "catalogo_no_disponible" }, { status: 503 });
    const index = buildSearchIndex(paradas, new Date().toISOString().slice(0, 10));
    return NextResponse.json(index, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" } });
}
```

Agregar en `next.config.ts` → `outputFileTracingIncludes`: `"/api/search-index": ["./data/static/**/*.json"]` (mismo motivo que `/api/reference`).

- [ ] **Step 6: Medir tamaño**

Con `next dev` corriendo: `node -e "fetch('http://localhost:3000/api/search-index').then(r=>r.text()).then(t=>{const z=require('zlib').gzipSync(t);console.log('paradas',JSON.parse(t).stops.length,'bytes',t.length,'gzip',z.length)})"`
Expected: gzip < 300 KB. Si supera, anotarlo en el commit (no optimizar ahora).

- [ ] **Step 7: Commit** — `feat(busqueda): índice local de paradas desde el catálogo estático`.

---

### Task 8: Motor de búsqueda

**Files:**
- Create: `features/search/lib/normalize.ts`, `features/search/lib/quickSearch.ts`
- Test: `features/search/lib/normalize.test.ts`, `features/search/lib/quickSearch.test.ts`

- [ ] **Step 1: Failing tests** — `normalize.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { displayCase, editDistanceAtMost1, normalizeText, tokens } from "./normalize";

describe("normalize", () => {
    it("minúsculas, sin tildes, abreviaturas", () => {
        expect(normalizeText("Avda. Pedro Luro")).toBe("avenida pedro luro");
        expect(normalizeText("Gral. Paz")).toBe("general paz");
        expect(normalizeText("CÓRDOBA")).toBe("cordoba");
        expect(normalizeText("12 de Octubre")).toBe("12 de octubre");
    });

    it("tokens sin palabras vacías", () => {
        expect(tokens("luro y salta")).toEqual(["luro", "salta"]);
        expect(tokens("esquina de luro con salta")).toEqual(["luro", "salta"]);
    });

    it("distancia de edición ≤ 1", () => {
        expect(editDistanceAtMost1("salta", "salta")).toBe(true);
        expect(editDistanceAtMost1("salta", "slta")).toBe(true);
        expect(editDistanceAtMost1("salta", "zalta")).toBe(true);
        expect(editDistanceAtMost1("salta", "saltaa")).toBe(true);
        expect(editDistanceAtMost1("salta", "sl")).toBe(false);
    });

    it("formato de nombres de calle", () => {
        expect(displayCase("12 DE OCTUBRE")).toBe("12 de Octubre");
        expect(displayCase("INDEPENDENCIA")).toBe("Independencia");
        expect(displayCase("JUAN B. JUSTO")).toBe("Juan B. Justo");
    });
});
```

`quickSearch.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { SearchIndex } from "./searchIndex";
import { looksLikeQuestion, quickSearch } from "./quickSearch";

const idx: SearchIndex = {
    v: 1,
    generatedAt: "2026-11-12",
    lines: [["98", "511"], ["120", "542"], ["130", "573"]],
    stops: [
        { id: "A", street: "LURO", cross: "SALTA", lat: -38.0, lng: -57.55, flag: "A PUERTO", lines: [["98", "511"], ["120", "542"]] },
        { id: "B", street: "LURO", cross: "CORDOBA", lat: -38.001, lng: -57.551, flag: null, lines: [["98", "511"]] },
        { id: "C", street: "INDEPENDENCIA", cross: "COLON", lat: -38.01, lng: -57.56, flag: null, lines: [["130", "573"]] },
        { id: "D", street: "12 DE OCTUBRE", cross: "ACHA", lat: -38.02, lng: -57.57, flag: null, lines: [["98", "511"]] },
    ],
};

describe("quickSearch", () => {
    it("sólo línea → calles de esa línea", () => {
        const r = quickSearch(idx, "511", {});
        expect(r.kind).toBe("streets-of-line");
        expect(r.items.map((i) => i.title)).toEqual(["12 de Octubre", "Luro"]);
    });

    it("línea + calle → paradas de esa línea sobre esa calle", () => {
        const r = quickSearch(idx, "511 luro", {});
        expect(r.kind).toBe("stops");
        expect(r.items.map((i) => [i.stopId, i.lineCode])).toEqual([["B", "98"], ["A", "98"]]);
        expect(r.items[1].title).toBe("Luro y Salta");
    });

    it("esquina → todas las líneas de esa esquina", () => {
        for (const q of ["luro y salta", "luro salta", "salta y luro", "LURO Y SALTA"]) {
            const r = quickSearch(idx, q, {});
            expect(r.items.map((i) => i.lineLabel)).toEqual(["511", "542"]);
        }
    });

    it("tolera un error de tipeo en palabras largas", () => {
        expect(quickSearch(idx, "luro y sallta", {}).items.length).toBe(2);
        expect(quickSearch(idx, "indepndencia", {}).items[0].title).toBe("Independencia y Colon");
    });

    it("una calle → esquinas de esa calle", () => {
        const r = quickSearch(idx, "luro", {});
        expect(r.kind).toBe("corners");
        expect(r.items.map((i) => i.title)).toEqual(["Luro y Cordoba", "Luro y Salta"]);
    });

    it("favoritos primero y luego cercanía", () => {
        const r = quickSearch(idx, "luro", { favoriteStopIds: new Set(["A"]) });
        expect(r.items[0].title).toBe("Luro y Salta");
        const near = quickSearch(idx, "luro", { near: { lat: -38.001, lng: -57.551 } });
        expect(near.items[0].title).toBe("Luro y Cordoba");
    });

    it("sin coincidencias → vacío", () => {
        expect(quickSearch(idx, "xyzzy", {}).items).toEqual([]);
    });

    it("máximo 8 resultados", () => {
        const many: SearchIndex = { ...idx, stops: Array.from({ length: 20 }, (_, i) => ({ ...idx.stops[0], id: `S${i}`, cross: `CALLE ${i}` })) };
        expect(quickSearch(many, "luro", {}).items.length).toBe(8);
    });

    it("detecta preguntas", () => {
        expect(looksLikeQuestion("¿cómo llego al puerto?")).toBe(true);
        expect(looksLikeQuestion("cuando pasa el 511")).toBe(true);
        expect(looksLikeQuestion("511 luro")).toBe(false);
    });
});
```

- [ ] **Step 2:** `npx vitest run features/search/lib/normalize.test.ts features/search/lib/quickSearch.test.ts` → FAIL.

- [ ] **Step 3: `normalize.ts`**

```ts
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
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9ñ ]+/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => ABBREVIATIONS[w] ?? w)
        .join(" ");
}

/** Palabras significativas. «de» se conserva dentro de números de calle («12 de octubre») vía normalizeText, no acá. */
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
```

- [ ] **Step 4: `quickSearch.ts`**

```ts
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
    /** Para «street»: consulta que expande esa calle. */
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

const titleCase = displayCase;

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

const cornerTitle = (s: IndexStop) => `${titleCase(s.street)} y ${titleCase(s.cross)}`;

export function quickSearch(index: SearchIndex, query: string, ctx: SearchContext): SearchResult {
    const words = tokens(query);
    if (words.length === 0) return { kind: "empty", items: [] };
    const lineByLabel = new Map(index.lines.map(([code, label]) => [label, code]));
    const lineWord = words.find((w) => lineByLabel.has(w));
    const rest = words.filter((w) => w !== lineWord);

    if (lineWord) {
        const code = lineByLabel.get(lineWord)!;
        const onLine = index.stops.filter((s) => s.lines.some(([c]) => c === code));
        if (rest.length === 0) {
            const streets = [...new Set(onLine.map((s) => s.street))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
            return {
                kind: "streets-of-line",
                items: streets.slice(0, MAX).map((street) => ({
                    key: `street:${code}:${street}`,
                    kind: "street",
                    title: titleCase(street),
                    subtitle: `Línea ${lineWord}`,
                    stopId: null,
                    lineCode: code,
                    lineLabel: lineWord,
                    expandQuery: `${lineWord} ${street.toLowerCase()}`,
                })),
            };
        }
        const hits = rank(onLine.filter((s) => matchesCorner(s, rest)), ctx);
        return {
            kind: hits.length ? "stops" : "empty",
            items: hits.slice(0, MAX).map((s) => ({
                key: `stop:${s.id}:${code}`,
                kind: "stop",
                title: cornerTitle(s),
                subtitle: s.flag ? `→ ${titleCase(s.flag)}` : null,
                stopId: s.id,
                lineCode: code,
                lineLabel: lineWord,
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
                items.push({ key: `stop:${s.id}:${code}`, kind: "stop", title: cornerTitle(s), subtitle: s.flag ? `→ ${titleCase(s.flag)}` : null, stopId: s.id, lineCode: code, lineLabel: label, expandQuery: null });
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
```

- [ ] **Step 5:** tests → todos pasan. Si `"luro"` (una palabra) devuelve `kind: "stops"` por el caso esquina, revisar que `isCorner` exija `words.length >= 2` (ya está). Si el orden alfabético de esquinas no coincide, usar `localeCompare(..., "es")` sobre `street + " " + cross` (ya está).

- [ ] **Step 6: Commit** — `feat(busqueda): motor de búsqueda local con tolerancia a errores`.

---

### Task 9: Agrupado por esquina y tarjeta «Ahora»

**Files:**
- Create: `features/home/lib/corners.ts`, `features/home/lib/nowCard.ts`
- Test: `features/home/lib/corners.test.ts`, `features/home/lib/nowCard.test.ts`

- [ ] **Step 1: Failing tests**

`corners.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { Favorito } from "@features/favorites/types";

import { groupByCorner } from "./corners";

const fav = (id: string, stop: string, line: string, calle?: string, inter?: string, nombre = id): Favorito => ({
    id, nombre, identificadorParada: stop, codigoLineaParada: line, lineaLabel: line, descripcionLinea: line, descripcionBandera: "—", calleLabel: calle, interseccionLabel: inter,
});

describe("groupByCorner", () => {
    it("agrupa por esquina normalizada respetando el orden del primer favorito", () => {
        const g = groupByCorner([
            fav("a", "P1", "511", "LURO", "SALTA"),
            fav("b", "P9", "573", "INDEPENDENCIA", "COLON"),
            fav("c", "P1", "542", "Luro", "Salta"),
        ]);
        expect(g.map((x) => x.title)).toEqual(["Luro y Salta", "Independencia y Colon"]);
        expect(g[0].favorites.map((f) => f.id)).toEqual(["a", "c"]);
    });

    it("sin calle agrupa por parada y usa el nombre del favorito", () => {
        const g = groupByCorner([fav("a", "P1", "511", undefined, undefined, "Casa"), fav("b", "P1", "542")]);
        expect(g).toHaveLength(1);
        expect(g[0].title).toBe("Casa");
    });
});
```

`nowCard.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { Favorito } from "@features/favorites/types";

import { pickNowCard } from "./nowCard";

const favs: Favorito[] = [
    { id: "P1_98", nombre: "Casa", identificadorParada: "P1", codigoLineaParada: "98", descripcionLinea: "511", descripcionBandera: "—" },
    { id: "P2_120", nombre: "Trabajo", identificadorParada: "P2", codigoLineaParada: "120", descripcionLinea: "542", descripcionBandera: "—" },
];
const stopCoords = new Map([["P1", { lat: -38.0, lng: -57.55 }], ["P2", { lat: -38.1, lng: -57.6 }]]);

describe("pickNowCard", () => {
    it("sin contexto no muestra nada", () => {
        expect(pickNowCard({ favoritos: favs, habitFavId: null, position: null, stopCoords })).toBeNull();
    });

    it("el horario aprendido gana", () => {
        expect(pickNowCard({ favoritos: favs, habitFavId: "P2_120", position: { lat: -38.0, lng: -57.55 }, stopCoords })).toEqual({ favId: "P2_120", reason: "habit" });
    });

    it("por ubicación sólo si está a menos de 400 m", () => {
        expect(pickNowCard({ favoritos: favs, habitFavId: null, position: { lat: -38.0005, lng: -57.5505 }, stopCoords })).toEqual({ favId: "P1_98", reason: "near" });
        expect(pickNowCard({ favoritos: favs, habitFavId: null, position: { lat: -38.05, lng: -57.58 }, stopCoords })).toBeNull();
    });

    it("ignora un hábito que ya no es favorito", () => {
        expect(pickNowCard({ favoritos: favs, habitFavId: "X", position: null, stopCoords })).toBeNull();
    });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementación**

`corners.ts`:

```ts
import type { Favorito } from "@features/favorites/types";
import { displayCase as titleCase, normalizeText } from "@features/search/lib/normalize";

export interface CornerGroup {
    key: string;
    title: string;
    favorites: Favorito[];
}
const clean = (s: string) => s.replace(/\s*-\s*MAR DEL PLATA\s*$/i, "").trim();

export function groupByCorner(favoritos: Favorito[]): CornerGroup[] {
    const groups = new Map<string, CornerGroup>();
    for (const f of favoritos) {
        const hasCorner = Boolean(f.calleLabel && f.interseccionLabel);
        const key = hasCorner ? `c:${normalizeText(clean(f.calleLabel!))}|${normalizeText(clean(f.interseccionLabel!))}` : `p:${f.identificadorParada}`;
        const title = hasCorner ? `${titleCase(clean(f.calleLabel!))} y ${titleCase(clean(f.interseccionLabel!))}` : f.nombre;
        const g = groups.get(key);
        if (g) g.favorites.push(f);
        else groups.set(key, { key, title, favorites: [f] });
    }
    return [...groups.values()];
}
```

`nowCard.ts`:

```ts
import type { Favorito } from "@features/favorites/types";
import { haversineMeters } from "@shared/geo/haversine";

export const NEAR_METERS = 400;

export interface NowCardInput {
    favoritos: Favorito[];
    habitFavId: string | null;
    position: { lat: number; lng: number } | null;
    stopCoords: Map<string, { lat: number; lng: number }>;
}

/** Tarjeta «Ahora» (spec §4): hábito aprendido → favorito a < 400 m → nada. Nunca inventa. */
export function pickNowCard(input: NowCardInput): { favId: string; reason: "habit" | "near" } | null {
    if (input.habitFavId && input.favoritos.some((f) => f.id === input.habitFavId)) return { favId: input.habitFavId, reason: "habit" };
    if (!input.position) return null;
    let best: { favId: string; d: number } | null = null;
    for (const f of input.favoritos) {
        const c = input.stopCoords.get(f.identificadorParada);
        if (!c) continue;
        const d = haversineMeters(input.position.lat, input.position.lng, c.lat, c.lng);
        if (d < NEAR_METERS && (!best || d < best.d)) best = { favId: f.id, d };
    }
    return best ? { favId: best.favId, reason: "near" } : null;
}
```

- [ ] **Step 4:** tests → 6 passed. **Step 5: Commit** — `feat(inicio): agrupado por esquina y elección de la tarjeta Ahora`.

---

### Task 10: Alerta de un toque

**Files:**
- Create: `features/alerts/lib/quickAlert.ts`
- Test: `features/alerts/lib/quickAlert.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";

import { alertRuleSchema } from "./engine";
import { quickAlertRule } from "./quickAlert";

const NOW = Date.parse("2026-11-12T21:30:00Z"); // 18:30 MDP
const target = { stopId: "10101", stopLabel: "Luro y Salta", lineCode: "98", lineLabel: "511", destination: "" };

describe("quickAlertRule", () => {
    it("usa caminata + 2 min y vale por 2 h hoy", () => {
        const r = quickAlertRule({ id: "q1", target, walkMin: 6, now: NOW });
        expect(alertRuleSchema.safeParse(r).success).toBe(true);
        expect(r.trigger).toEqual({ type: "eta-threshold", minutes: 8 });
        expect(r.schedule).toEqual({ type: "once", date: "2026-11-12", from: "18:30", to: "20:30" });
    });

    it("sin caminata usa 5 min", () => {
        expect(quickAlertRule({ id: "q2", target, walkMin: null, now: NOW }).trigger).toEqual({ type: "eta-threshold", minutes: 5 });
    });

    it("no cruza medianoche", () => {
        const late = Date.parse("2026-11-13T02:30:00Z"); // 23:30 MDP
        expect(quickAlertRule({ id: "q3", target, walkMin: 3, now: late }).schedule).toMatchObject({ from: "23:30", to: "23:59" });
    });

    it("acota a 60 min", () => {
        expect(quickAlertRule({ id: "q4", target, walkMin: 90, now: NOW }).trigger).toEqual({ type: "eta-threshold", minutes: 60 });
    });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementación**

```ts
import { arLocalParts } from "@shared/time/argentina";

import { alertRuleSchema, type AlertRule } from "./engine";

export interface QuickAlertInput {
    id: string;
    target: { stopId: string; stopLabel: string; lineCode: string; lineLabel: string; destination: string };
    walkMin: number | null;
    now: number;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** «Avisarme» en un toque (spec §6): cuando falte lo justo para salir, durante las próximas 2 h de hoy. */
export function quickAlertRule(input: QuickAlertInput): AlertRule {
    const minutes = Math.min(60, Math.max(1, input.walkMin === null ? 5 : input.walkMin + 2));
    const { date, minuteOfDay } = arLocalParts(input.now);
    const to = Math.min(23 * 60 + 59, minuteOfDay + 120);
    return alertRuleSchema.parse({
        id: input.id,
        enabled: true,
        targets: [input.target],
        trigger: { type: "eta-threshold", minutes },
        schedule: { type: "once", date, from: hhmm(minuteOfDay), to: hhmm(to) },
    });
}
```

- [ ] **Step 4:** tests → 4 passed. Si `alertRuleSchema` exige campos extra en `targets` (ver `features/alerts/lib/engine.ts`), agregarlos con los valores del objeto `target` y repetir. **Step 5: Commit** — `feat(alertas): alerta de un toque`.

---

### Task 11: Pantalla de Inicio

**Files:**
- Create: `features/search/hooks/useSearchIndex.ts`, `features/home/hooks/usePairArrivals.ts`, `features/home/hooks/useNow.ts`, `features/home/components/HomeScreen.tsx`, `features/home/components/SearchBar.tsx`, `features/home/components/SearchResults.tsx`, `features/home/components/CornerCard.tsx`, `features/home/components/NowCard.tsx`, `features/home/components/LineChip.tsx`, `features/home/lib/recentSearches.ts` (+test), `app/(main)/page.tsx`

- [ ] **Step 1: Recientes (test primero)** — `features/home/lib/recentSearches.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { pushRecent } from "./recentSearches";

describe("pushRecent", () => {
    it("deja las últimas 3, sin duplicados, la más nueva primero", () => {
        expect(pushRecent(["a", "b", "c"], "d")).toEqual(["d", "a", "b"]);
        expect(pushRecent(["a", "b"], "b")).toEqual(["b", "a"]);
        expect(pushRecent([], "  ")).toEqual([]);
    });
});
```

`recentSearches.ts`:

```ts
export const RECENTS_KEY = "bondi:recent-searches";

export function pushRecent(list: string[], q: string): string[] {
    const t = q.trim();
    if (!t) return list;
    return [t, ...list.filter((x) => x !== t)].slice(0, 3);
}

export function loadRecents(): string[] {
    try {
        const v = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 3) : [];
    } catch {
        return [];
    }
}

export function saveRecents(list: string[]): void {
    try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
    } catch {
        // Almacenamiento no disponible: los recientes son una comodidad.
    }
}
```

Run test → pasa. (El prefijo `bondi:` hace que el borrado de datos locales de `/perfil` ya lo incluya.)

- [ ] **Step 2: Hooks**

`features/home/hooks/useNow.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

/** Reloj para cuentas regresivas (React Compiler: nada de Date.now() en render). */
export function useNow(intervalMs = 15_000): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}
```

`features/search/hooks/useSearchIndex.ts`:

```ts
"use client";

import useSWR from "swr";

import type { SearchIndex } from "@features/search/lib/searchIndex";

/** Índice de búsqueda: se descarga tras el primer render y SWR lo reutiliza. */
export function useSearchIndex(): SearchIndex | null {
    const { data } = useSWR<SearchIndex>(
        "/api/search-index",
        async (url: string) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`search-index ${res.status}`);
            return (await res.json()) as SearchIndex;
        },
        { revalidateOnFocus: false, revalidateIfStale: false, dedupingInterval: 3_600_000 },
    );
    return data ?? null;
}
```

`features/home/hooks/usePairArrivals.ts` — reutiliza el fetcher existente (no se modifica `shared/api/client.ts`, sólo se importa):

```ts
"use client";

import { useState } from "react";
import useSWR from "swr";

import type { Arribo } from "@features/arrivals/types";
import { normalizeArribo, type NormalizedArrival } from "@features/arrivals/lib/normalize";
import { swrFetcherWithMeta, type MgpResult, type SwrActionKey } from "@shared/api/client";

type Result = MgpResult<{ arribos?: Arribo[] }>;

export interface PairArrivals {
    arrivals: NormalizedArrival[];
    fetchedAt: number | null;
    error: boolean;
    loading: boolean;
}

/** Arribos en vivo de un par (parada, línea) para las tarjetas de Inicio. Mismo polling que el panel (25 s). */
export function usePairArrivals(stopId: string, lineCode: string): PairArrivals {
    const [fetchedAt, setFetchedAt] = useState<number | null>(null);
    const { data, error, isLoading } = useSWR<Result>(
        ["RecuperarProximosArribosW", { identificadorParada: stopId, codigoLineaParada: lineCode }],
        swrFetcherWithMeta as (key: SwrActionKey) => Promise<Result>,
        { refreshInterval: 25_000, refreshWhenHidden: false, revalidateOnFocus: true, onSuccess: () => setFetchedAt(Date.now()) },
    );
    const raw = data?.data?.arribos ?? [];
    const at = fetchedAt ?? 0;
    return {
        arrivals: raw.map((a) => normalizeArribo(a, { stopId, lineCode, fetchedAt: at })).filter((a) => a.etaMinutes !== null || a.status === "arriving"),
        fetchedAt,
        error: Boolean(error),
        loading: isLoading,
    };
}
```

Antes de seguir, verificar en `features/arrivals/lib/normalize.ts` los nombres exactos `NormalizedArrival`, `etaMinutes`, `status` y `"arriving"`; si difieren, usar los reales.

- [ ] **Step 3: Componentes de presentación**

`LineChip.tsx`:

```tsx
import { lineColor } from "@features/brand/lineColor";

export function LineChip({ label }: { readonly label: string }) {
    const c = lineColor(label);
    return (
        <span className="inline-flex min-w-[44px] items-center justify-center rounded-[8px] px-2 py-1 text-[15px] font-bold tabular-nums" style={{ backgroundColor: c.bg, color: c.fg }}>
            {label}
        </span>
    );
}
```

`CornerCard.tsx` — una tarjeta por esquina; cada fila es un favorito con sus dos próximos arribos:

```tsx
"use client";

import type { Favorito } from "@features/favorites/types";
import { ArrivalTime } from "@features/arrivals/components/ArrivalTime";
import { usePairArrivals } from "@features/home/hooks/usePairArrivals";
import type { CornerGroup } from "@features/home/lib/corners";

import { LineChip } from "./LineChip";

function FavoriteRow({ fav, now, onOpen }: { readonly fav: Favorito; readonly now: number; readonly onOpen: (f: Favorito) => void }) {
    const { arrivals, fetchedAt, loading } = usePairArrivals(fav.identificadorParada, fav.codigoLineaParada);
    const label = fav.lineaLabel ?? fav.descripcionLinea;
    const first = arrivals[0];
    const second = arrivals[1];
    return (
        <button type="button" onClick={() => onOpen(fav)} className="flex min-h-[56px] w-full items-center gap-3 py-2 text-left">
            <LineChip label={label} />
            <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">
                {fav.descripcionBandera && fav.descripcionBandera !== "—" ? `→ ${fav.descripcionBandera}` : fav.nombre}
            </span>
            {fetchedAt === null ? (
                <span className="text-[13px] text-muted-foreground">{loading ? "…" : "Sin datos"}</span>
            ) : first ? (
                <span className="flex items-baseline gap-2">
                    <ArrivalTime input={{ kind: "live", etaMinutes: first.etaMinutes, arriving: first.status === "arriving", fetchedAt, now }} />
                    {second ? <span className="text-[13px] tabular-nums text-muted-foreground">· {second.etaMinutes}</span> : null}
                </span>
            ) : (
                <ArrivalTime input={{ kind: "none", headwayMin: null }} />
            )}
        </button>
    );
}

export function CornerCard({ group, now, onOpen }: { readonly group: CornerGroup; readonly now: number; readonly onOpen: (f: Favorito) => void }) {
    return (
        <section className="rounded-[16px] border border-border bg-card px-4 py-2" aria-label={group.title}>
            <h3 className="pt-1 text-[13px] font-semibold text-muted-foreground">{group.title}</h3>
            <div className="divide-y divide-border">
                {group.favorites.map((f) => (
                    <FavoriteRow key={f.id} fav={f} now={now} onOpen={onOpen} />
                ))}
            </div>
        </section>
    );
}
```

`NowCard.tsx`:

```tsx
"use client";

import type { Favorito } from "@features/favorites/types";
import { ArrivalTime } from "@features/arrivals/components/ArrivalTime";
import { usePairArrivals } from "@features/home/hooks/usePairArrivals";

import { LineChip } from "./LineChip";

export function NowCard({ fav, reason, now, onOpen }: { readonly fav: Favorito; readonly reason: "habit" | "near"; readonly now: number; readonly onOpen: (f: Favorito) => void }) {
    const { arrivals, fetchedAt } = usePairArrivals(fav.identificadorParada, fav.codigoLineaParada);
    const first = arrivals[0];
    return (
        <button type="button" onClick={() => onOpen(fav)} className="w-full rounded-[20px] border border-border bg-card p-4 text-left shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[1.2px] text-muted-foreground">
                Ahora · {reason === "habit" ? "a esta hora solés ir" : "cerca tuyo"}
            </p>
            <div className="mt-2 flex items-center gap-2">
                <LineChip label={fav.lineaLabel ?? fav.descripcionLinea} />
                <span className="truncate text-[15px] font-semibold">{fav.nombre}</span>
            </div>
            <div className="mt-3 flex items-end justify-between">
                {fetchedAt !== null && first ? (
                    <ArrivalTime size="hero" input={{ kind: "live", etaMinutes: first.etaMinutes, arriving: first.status === "arriving", fetchedAt, now }} />
                ) : (
                    <span className="text-[15px] text-muted-foreground">{fetchedAt === null ? "Cargando…" : "Sin arribos ahora"}</span>
                )}
                {arrivals[1] ? <span className="text-[17px] tabular-nums text-muted-foreground">luego {arrivals[1].etaMinutes}</span> : null}
            </div>
        </button>
    );
}
```

`SearchResults.tsx`:

```tsx
"use client";

import type { SearchItem } from "@features/search/lib/quickSearch";

import { LineChip } from "./LineChip";

interface Props {
    readonly items: SearchItem[];
    readonly question: string | null;
    readonly onPick: (item: SearchItem) => void;
    readonly onAsk: (q: string) => void;
    readonly onByStreets: () => void;
}

export function SearchResults({ items, question, onPick, onAsk, onByStreets }: Props) {
    return (
        <div>
            <p className="sr-only" aria-live="polite">{`${items.length} resultados`}</p>
            <ul className="divide-y divide-border">
                {items.map((it) => (
                    <li key={it.key}>
                        <button type="button" onClick={() => onPick(it)} className="flex min-h-[56px] w-full items-center gap-3 px-1 py-2 text-left">
                            {it.lineLabel ? <LineChip label={it.lineLabel} /> : <span className="w-[44px] text-center text-[18px]" aria-hidden="true">⌖</span>}
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[16px] font-semibold">{it.title}</span>
                                {it.subtitle ? <span className="block truncate text-[13px] text-muted-foreground">{it.subtitle}</span> : null}
                            </span>
                        </button>
                    </li>
                ))}
                {question ? (
                    <li>
                        <button type="button" onClick={() => onAsk(question)} className="flex min-h-[56px] w-full items-center gap-3 px-1 py-2 text-left">
                            <span className="w-[44px] text-center text-[18px]" aria-hidden="true">✦</span>
                            <span className="text-[15px]">Preguntarle al asistente: «{question}»</span>
                        </button>
                    </li>
                ) : null}
            </ul>
            {items.length === 0 && !question ? (
                <div className="px-1 py-4 text-[14px] text-muted-foreground">
                    No encontré esa línea o calle.{" "}
                    <button type="button" className="font-semibold text-accent underline" onClick={onByStreets}>
                        Buscar por calles
                    </button>
                </div>
            ) : null}
        </div>
    );
}
```

`SearchBar.tsx` — barra fija abajo en celular, arriba en escritorio; teclado numérico por defecto:

```tsx
"use client";

import { useState } from "react";

interface Props {
    readonly value: string;
    readonly onChange: (v: string) => void;
    readonly onFocusChange: (focused: boolean) => void;
    readonly onNear: () => void;
}

export function SearchBar({ value, onChange, onFocusChange, onNear }: Props) {
    const [numeric, setNumeric] = useState(true);
    return (
        <div className="flex items-center gap-2 rounded-[14px] border border-border bg-card px-3 py-2 shadow-sm">
            <span aria-hidden="true">🔍</span>
            <input
                type="search"
                inputMode={numeric ? "numeric" : "text"}
                enterKeyHint="search"
                aria-label="Buscar línea, calle o pregunta"
                placeholder="Línea, calle o pregunta"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => onFocusChange(true)}
                onBlur={() => onFocusChange(false)}
                className="min-h-[44px] flex-1 bg-transparent text-[16px] outline-none"
            />
            <button type="button" onClick={() => setNumeric((n) => !n)} className="min-h-[44px] min-w-[44px] rounded-[10px] text-[13px] font-semibold text-muted-foreground" aria-label={numeric ? "Teclado de letras" : "Teclado numérico"}>
                {numeric ? "abc" : "123"}
            </button>
            <button type="button" onClick={onNear} className="min-h-[44px] min-w-[44px] rounded-[10px] text-[18px]" aria-label="Paradas cerca mío">
                📍
            </button>
        </div>
    );
}
```

- [ ] **Step 4: `HomeScreen.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { Favorito } from "@features/favorites/types";
import { useFavoritesStore } from "@features/favorites/store/useFavoritesStore";
import { groupByCorner } from "@features/home/lib/corners";
import { pickNowCard } from "@features/home/lib/nowCard";
import { loadRecents, pushRecent, saveRecents } from "@features/home/lib/recentSearches";
import { useNow } from "@features/home/hooks/useNow";
import { suggest } from "@features/personalization/lib/habits";
import { useHabitsStore } from "@features/personalization/store/useHabitsStore";
import { looksLikeQuestion, quickSearch, type SearchItem } from "@features/search/lib/quickSearch";
import { useSearchIndex } from "@features/search/hooks/useSearchIndex";
import { useSearchFlowStore } from "@features/search/store/useSearchFlowStore";

import { CornerCard } from "./CornerCard";
import { NowCard } from "./NowCard";
import { SearchBar } from "./SearchBar";
import { SearchResults } from "./SearchResults";

export function HomeScreen() {
    const router = useRouter();
    const favoritos = useFavoritesStore((s) => s.favoritos);
    const habitsEnabled = useHabitsStore((s) => s.enabled);
    const habitEvents = useHabitsStore((s) => s.events);
    const index = useSearchIndex();
    const now = useNow();
    const [query, setQuery] = useState("");
    const [focused, setFocused] = useState(false);
    const [recents, setRecents] = useState<string[]>(() => (typeof window === "undefined" ? [] : loadRecents()));

    const groups = useMemo(() => groupByCorner(favoritos), [favoritos]);
    const stopCoords = useMemo(() => new Map((index?.stops ?? []).map((s) => [s.id, { lat: s.lat, lng: s.lng }])), [index]);
    const habitFavId = useMemo(() => {
        if (!habitsEnabled) return null;
        return suggest(habitEvents, now, new Set(favoritos.map((f) => f.id)))?.favId ?? null;
    }, [habitsEnabled, habitEvents, now, favoritos]);
    const nowPick = pickNowCard({ favoritos, habitFavId, position: null, stopCoords });
    const nowFav = nowPick ? favoritos.find((f) => f.id === nowPick.favId) ?? null : null;

    const favStopIds = useMemo(() => new Set(favoritos.map((f) => f.identificadorParada)), [favoritos]);
    const result = useMemo(() => (index && query.trim() ? quickSearch(index, query, { favoriteStopIds: favStopIds }) : null), [index, query, favStopIds]);
    const question = query.trim() && (looksLikeQuestion(query) || result?.items.length === 0) ? query.trim() : null;

    const openStop = (paradaId: string, codLinea: string) => {
        useSearchFlowStore.getState().resetToParada(paradaId, codLinea, { consulting: true });
    };
    const openFav = (f: Favorito) => openStop(f.identificadorParada, f.codigoLineaParada);
    const remember = (q: string) => {
        const next = pushRecent(recents, q);
        setRecents(next);
        saveRecents(next);
    };
    const onPick = (it: SearchItem) => {
        remember(query);
        if (it.stopId && it.lineCode) openStop(it.stopId, it.lineCode);
        else if (it.expandQuery) setQuery(it.expandQuery);
    };
    const onAsk = (q: string) => {
        remember(q);
        router.push(`/asistente?q=${encodeURIComponent(q)}`);
    };

    const searching = query.trim().length > 0;
    return (
        <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-4 px-4 pb-[calc(140px+env(safe-area-inset-bottom))] pt-4 lg:pb-8">
            <div className="order-last lg:order-first">
                <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 px-4 pb-2 lg:static lg:px-0">
                    <div className="mx-auto max-w-[640px]">
                        <SearchBar value={query} onChange={setQuery} onFocusChange={setFocused} onNear={() => router.push("/paradas-cerca")} />
                    </div>
                </div>
            </div>

            {searching ? (
                <SearchResults items={result?.items ?? []} question={question} onPick={onPick} onAsk={onAsk} onByStreets={() => router.push("/consultar")} />
            ) : (
                <>
                    {focused && recents.length > 0 ? (
                        <div className="flex flex-wrap gap-2" aria-label="Búsquedas recientes">
                            {recents.map((r) => (
                                <button key={r} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setQuery(r)} className="min-h-[40px] rounded-full border border-border px-3 text-[14px]">
                                    {r}
                                </button>
                            ))}
                        </div>
                    ) : null}
                    {nowFav && nowPick ? <NowCard fav={nowFav} reason={nowPick.reason} now={now} onOpen={openFav} /> : null}
                    {groups.length > 0 ? (
                        <section className="flex flex-col gap-3">
                            <h2 className="text-[12px] font-semibold uppercase tracking-[1.2px] text-muted-foreground">Tus paradas</h2>
                            {groups.map((g) => (
                                <CornerCard key={g.key} group={g} now={now} onOpen={openFav} />
                            ))}
                        </section>
                    ) : (
                        <div className="rounded-[16px] border border-dashed border-border p-5 text-[15px] text-muted-foreground">
                            Buscá tu parada abajo y tocá <strong>♥</strong> para tenerla acá siempre, con los minutos al abrir.
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
```

Notas para quien implementa:
- Verificar en `features/personalization/lib/habits.ts` que `suggest(...)` devuelve un objeto con `favId`; si el campo se llama distinto, usar el real.
- Verificar que `useHabitsStore` expone `events` (ver `partialize`).
- La posición del usuario no se pide al abrir (spec: sólo al tocar 📍); por eso `position: null` en Inicio.

- [ ] **Step 5: Ruta** — `app/(main)/page.tsx`

```tsx
import type { Metadata } from "next";

import { HomeScreen } from "@features/home/components/HomeScreen";
import { BRAND } from "@shared/brand";

export const metadata: Metadata = { title: { absolute: `${BRAND.name} — ${BRAND.description}` } };

export default function Page() {
    return <HomeScreen />;
}
```

- [ ] **Step 6: Asistente acepta `?q=`**

En `features/assistant/components/AssistantClient.tsx`: si hay `q` en la URL (`useSearchParams`), al montar se envía como primera pregunta una sola vez (guardar en un `useRef` que ya se envió). `app/(main)/asistente/page.tsx` debe envolver el cliente en `<Suspense>` si todavía no lo hace (requisito de `useSearchParams`).

- [ ] **Step 7: Verificar**

`npx tsc --noEmit -p .` → 0; `npx vitest run features/home features/search` → pasan. Con el mock: terminal 1 `node scripts/mock-mgp-upstream.mjs`; terminal 2 `$env:MGP_DIRECT_DISABLED='true'; $env:MGP_UPSTREAM='http://127.0.0.1:3200'; npx next dev -p 3100` (sin `.env.local` de datos reales: usar estas variables en la sesión). Abrir `http://localhost:3100/`: con favoritos de prueba en `localStorage["cuandollega_favoritos"]` se ven agrupados por esquina con minutos MOCK; escribir `511` muestra calles; tocar una parada abre el panel de arribos.

- [ ] **Step 8: Commit** — `feat(inicio): pantalla de inicio con búsqueda instantánea y paradas por esquina`.

---

### Task 12: Navegación de 3 pestañas, Viajes y Más

**Files:**
- Modify: `shared/layout/BottomNav.tsx`, `shared/layout/Header.tsx`, `next.config.ts`
- Create: `app/(main)/viajes/page.tsx`, `app/(main)/mas/page.tsx`

- [ ] **Step 1: `BottomNav.tsx`**

Reemplazar `NavTab` y `NAV_ITEMS` por:

```tsx
type NavTab = "inicio" | "viajes" | "mas";

const NAV_ITEMS: { id: NavTab; label: string; href: string; match: (p: string) => boolean; icon: () => React.ReactNode }[] = [
    { id: "inicio", label: "Inicio", href: "/", match: (p) => p === "/" || p.startsWith("/consultar") || p.startsWith("/favoritos"), icon: () => <IconSearch className="h-[22px] w-[22px]" /> },
    { id: "viajes", label: "Viajes", href: "/viajes", match: (p) => ["/viajes", "/como-llego", "/recorrido", "/paradas-cerca"].some((x) => p.startsWith(x)), icon: () => <Bus className="h-[22px] w-[22px]" /> },
    { id: "mas", label: "Más", href: "/mas", match: (p) => ["/mas", "/alertas", "/widgets", "/asistente", "/perfil", "/acerca", "/privacidad", "/terminos"].some((x) => p.startsWith(x)), icon: () => <IconInfo className="h-[22px] w-[22px]" /> },
];
```

Usar `item.match(pathname)` para el estado activo (reemplaza la lógica actual de comparación). Quitar `PlayStoreNavLink`, `IconStar` e `IconBus` si quedan sin uso. Áreas táctiles ≥ 48 px. `aria-label` del logo: `` `${BRAND.name} — Ir al inicio` ``.

- [ ] **Step 2: `/viajes`** — `app/(main)/viajes/page.tsx`

```tsx
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Viajes" };

const ITEMS = [
    { href: "/como-llego", title: "Cómo llego", text: "De dónde estás a dónde vas: qué línea tomar y cuándo salir." },
    { href: "/recorrido", title: "Recorridos", text: "El trayecto de cada línea en el mapa, con sus paradas." },
    { href: "/paradas-cerca", title: "Paradas cerca mío", text: "Las paradas a pocas cuadras y qué líneas pasan." },
];

export default function Page() {
    return (
        <main className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-4 py-4">
            <h1 className="text-[22px] font-bold">Viajes</h1>
            {ITEMS.map((i) => (
                <Link key={i.href} href={i.href} className="block min-h-[64px] rounded-[16px] border border-border bg-card p-4 no-underline">
                    <span className="block text-[16px] font-semibold text-foreground">{i.title}</span>
                    <span className="block text-[14px] text-muted-foreground">{i.text}</span>
                </Link>
            ))}
        </main>
    );
}
```

- [ ] **Step 3: `/mas`** — `app/(main)/mas/page.tsx`, misma estructura con estos ítems:

```tsx
const ITEMS = [
    { href: "/alertas", title: "Alertas", text: "Avisos cuando tu colectivo está por llegar." },
    { href: "/asistente", title: "Asistente", text: "Preguntá en lenguaje natural." },
    { href: "/widgets", title: "Widgets", text: "Tus paradas en la pantalla de inicio del celular." },
    { href: "/favoritos", title: "Tus paradas", text: "Renombrar, ordenar y sugerencias por horario." },
    { href: "/recorrido", title: "Reseñas de líneas", text: "Opiniones de quienes viajan." },
    { href: "/perfil", title: "Perfil y datos", text: "Pantalla, alto contraste y borrar datos de este dispositivo." },
    { href: "/acerca", title: "Acerca de", text: "Quiénes somos, privacidad y términos." },
];
```

con `metadata = { title: "Más" }` y `<h1>Más</h1>`.

- [ ] **Step 4: Redirects** — en `next.config.ts` → `redirects()` agregar sólo `{ source: "/inicio", destination: "/", permanent: true }`. **No** redirigir `/favoritos` (queda como gestión de paradas en «Más») ni `/consultar` (la usan el panel de arribos, los enlaces de paradas y los widgets nativos).

- [ ] **Step 5: Header** — en `Header.tsx` quitar `PlayStoreNavLink`; en escritorio mostrar los mismos 3 destinos que la barra inferior.

- [ ] **Step 6: Verificar** — `npx tsc --noEmit -p .` → 0; con `next dev` (mock) recorrer `/`, `/viajes`, `/mas` y cada enlace → 200; la pestaña activa se resalta en cada sección.

- [ ] **Step 7: Commit** — `feat(nav): tres pestañas (Inicio, Viajes, Más)`.

---

### Task 13: Detalle de parada ordenado y barra de acciones

**Files:**
- Create: `features/arrivals/components/StopActionBar.tsx`
- Modify: `features/arrivals/components/ArrivalsPanel.tsx`

- [ ] **Step 1: `StopActionBar.tsx`**

```tsx
"use client";

import { useAlertsStore } from "@features/alerts/store/useAlertsStore";
import { quickAlertRule } from "@features/alerts/lib/quickAlert";
import { toast } from "@shared/ui/store/useToastStore";

interface Props {
    readonly isFavorite: boolean;
    readonly onToggleFavorite: () => void;
    readonly share: React.ReactNode;
    readonly target: { stopId: string; stopLabel: string; lineCode: string; lineLabel: string; destination: string } | null;
    readonly walkMin: number | null;
}

export function StopActionBar({ isFavorite, onToggleFavorite, share, target, walkMin }: Props) {
    const upsert = useAlertsStore((s) => s.upsert);
    const onAlert = () => {
        if (!target) return;
        const rule = quickAlertRule({ id: `q-${target.stopId}-${target.lineCode}-${Date.now()}`, target, walkMin, now: Date.now() });
        const ok = upsert(rule);
        toast({ description: ok ? `Te aviso cuando falten ${rule.trigger.type === "eta-threshold" ? rule.trigger.minutes : ""} min (próximas 2 h).` : "Llegaste al máximo de alertas." });
    };
    return (
        <div className="sticky bottom-0 z-10 -mx-4 mt-3 flex gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
            <button type="button" onClick={onToggleFavorite} aria-pressed={isFavorite} className="min-h-[48px] flex-1 rounded-[12px] border border-border text-[15px] font-semibold">
                {isFavorite ? "♥ Guardada" : "♡ Guardar"}
            </button>
            <button type="button" onClick={onAlert} disabled={!target} className="min-h-[48px] flex-1 rounded-[12px] border border-border text-[15px] font-semibold disabled:opacity-50">
                🔔 Avisarme
            </button>
            <div className="flex min-h-[48px] flex-1 items-center justify-center rounded-[12px] border border-border">{share}</div>
        </div>
    );
}
```

Verificar el nombre real del store de toasts (`@shared/ui/store/useToastStore`, función `toast`), usado hoy en `MainLayoutClient.tsx`.

- [ ] **Step 2: `ArrivalsPanel.tsx`** — reordenar:
1. Encabezado y estado de actualización (como hoy, sin los botones ♥ y compartir del encabezado).
2. `OfflineEstimateNotice` (como hoy).
3. Lista de arribos: cada `ArriboCard` muestra los minutos con `ArrivalTime` (`size="hero"` el primero, `"row"` el resto), usando `kind: "live"`, `fetchedAt = lastUpdate.getTime()` y `now = nowTick`.
4. `DepartureAdvisor` (sube: ahora va inmediatamente después de los arribos).
5. `AnomalyNotice`, `CommunityReports`.
6. `OtrasLineasSuggestion`.
7. `StopActionBar` con `isFavorite=isCurrentFavorito`, `onToggleFavorite=handleToggleFavCurrent`, `share={<ShareButton ... />}`, `target={{ stopId: paradaId, stopLabel: [calleLabel, interseccionLabel].filter(Boolean).join(" y ") || paradaId, lineCode: codLinea, lineLabel: (lineaLabel ?? codLinea).trim(), destination: "" }}`, `walkMin={null}` (si `DepartureAdvisor` expone la caminata calculada, pasarla).

- [ ] **Step 3: Verificar** — `npx tsc --noEmit -p .` → 0; `npx vitest run features/arrivals` → pasan. Con el mock: abrir una parada, tocar «Avisarme» → toast y aparece en `/alertas`.

- [ ] **Step 4: Commit** — `feat(detalle): orden por importancia y barra Guardar · Avisarme · Compartir`.

---

### Task 14: Alto contraste

**Files:**
- Create: `shared/display/useDisplayPrefs.ts`
- Modify: `app/globals.css`, `app/perfil/PerfilClient.tsx`, `shared/layout/ThemeProvider.tsx`

- [ ] **Step 1: Store**

```ts
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface DisplayPrefs {
    highContrast: boolean;
    setHighContrast: (v: boolean) => void;
}

export const useDisplayPrefs = create<DisplayPrefs>()(
    persist((set) => ({ highContrast: false, setHighContrast: (v) => set({ highContrast: v }) }), { name: "bondi:display", version: 1 }),
);
```

- [ ] **Step 2: Aplicarlo** — en `ThemeProvider.tsx`, un efecto que haga `document.documentElement.dataset.contrast = highContrast ? "high" : ""`. En `globals.css`:

```css
:root[data-contrast="high"] {
    --muted-foreground: #1f2937;
    --border: #111827;
}
:root[data-contrast="high"].dark,
.dark :root[data-contrast="high"] {
    --muted-foreground: #e5e7eb;
    --border: #f9fafb;
}
```

(Usar los nombres reales de las variables CSS de `globals.css` para texto secundario y bordes; verificar antes.)

- [ ] **Step 3: Interruptor** — en `PerfilClient.tsx`, sección «Pantalla» con un `<label>` + `<input type="checkbox" role="switch">` «Alto contraste (para usar al sol)».

- [ ] **Step 4: Verificar** y **Commit** — `feat(ui): modo alto contraste`.

---

### Task 15: Métricas propias de experiencia (apagadas por defecto)

**Files:**
- Create: `features/home/lib/uxMetrics.ts` (+test), `app/api/ux/route.ts`
- Modify: `features/home/components/HomeScreen.tsx`, `lib/server/metrics.ts` (sólo usar `increment`, sin cambiar firmas)

- [ ] **Step 1: Test** — `features/home/lib/uxMetrics.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { sanitizeMissQuery, uxEventSchema } from "./uxMetrics";

describe("uxMetrics", () => {
    it("no registra direcciones con número de puerta", () => {
        expect(sanitizeMissQuery("luro 3456")).toBeNull();
        expect(sanitizeMissQuery("ab")).toBeNull();
        expect(sanitizeMissQuery("Avda Colón")).toBe("avenida colon");
    });

    it("valida eventos", () => {
        expect(uxEventSchema.safeParse({ type: "time_to_minutes", ms: 1200 }).success).toBe(true);
        expect(uxEventSchema.safeParse({ type: "search_miss", q: "x".repeat(81) }).success).toBe(false);
    });
});
```

- [ ] **Step 2: Implementación** — `uxMetrics.ts`

```ts
import { z } from "zod";

import { normalizeText } from "@features/search/lib/normalize";

export const uxEventSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("time_to_minutes"), ms: z.number().int().min(0).max(120_000) }),
    z.object({ type: z.literal("taps_to_minutes"), taps: z.number().int().min(0).max(20) }),
    z.object({ type: z.literal("search_miss"), q: z.string().min(3).max(80) }),
    z.object({ type: z.literal("quick_alert") }),
]);
export type UxEvent = z.infer<typeof uxEventSchema>;

/** Búsquedas sin resultado: sólo texto normalizado, sin números de 4+ dígitos (evita direcciones). */
export function sanitizeMissQuery(q: string): string | null {
    const n = normalizeText(q);
    if (n.length < 3 || /\d{4,}/.test(n)) return null;
    return n.slice(0, 80);
}

export function sendUx(event: UxEvent): void {
    if (process.env.NEXT_PUBLIC_UX_METRICS_ENABLED !== "true") return;
    try {
        void fetch("/api/ux", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event), keepalive: true });
    } catch {
        // Métricas opcionales.
    }
}
```

`app/api/ux/route.ts`: valida con `uxEventSchema`, rate limit con `RateLimiter(60, 60_000)` de `lib/server/rateLimit.ts`, y llama `increment(...)` de `lib/server/metrics.ts` con claves `ux.time_to_minutes.<bucket>` (buckets `<1s`, `1-3s`, `>3s`), `ux.taps.<n>`, `ux.search_miss`, `ux.quick_alert`. Nunca guarda el texto de la búsqueda en métricas agregadas: `search_miss` sólo cuenta; el texto sanitizado se emite con `logEvent("ux_search_miss", { q })` para revisar sinónimos.

- [ ] **Step 3: Enganchar** — en `HomeScreen`: al mostrar el primer minuto de una tarjeta, `sendUx({ type: "time_to_minutes", ms: performance.now() | 0 })` una sola vez por carga; búsqueda vacía de ≥ 3 caracteres sin resultados tras 1 s quieto → `search_miss` con `sanitizeMissQuery`. En `StopActionBar.onAlert` → `quick_alert`.

- [ ] **Step 4:** tests + `tsc` → OK. Documentar `NEXT_PUBLIC_UX_METRICS_ENABLED` en `docs/env-reference.md`. **Commit** — `feat(metricas): métricas de experiencia propias y anónimas (apagadas por defecto)`.

---

### Task 16: Verificación final y documentación

**Files:**
- Modify: `docs/testing-results.md`, `docs/progress.md`, `docs/decisions.md`, `docs/privacy/data-inventory.md`, `docs/blockers.md`

- [ ] **Step 1: Marca** — `git grep -n -i -E "bondi ?mdp|bondimdp" -- app features shared lib mobile public scripts capacitor.config.ts` → sólo claves de almacenamiento (`bondimdp:`) e identificadores técnicos Android (`com.bondimdp`). Anotar el resultado.
- [ ] **Step 2: Suite** — `npx vitest run` → sólo los 10 de B7. `npx tsc --noEmit -p .` → 0. `npx eslint .` → 0 errores (los 2 preexistentes desaparecieron con los archivos borrados). `npx next build` → OK; anotar el tamaño de First Load JS de `/` (meta < 150 KB comprimido; si supera, registrar en `docs/testing-results.md` qué módulos pesan).
- [ ] **Step 3: Recorrido en navegador con mock** — flujo: abrir `/` sin favoritos → buscar `511` → elegir calle → elegir parada → panel con minutos → ♥ Guardar → volver a `/` → la parada aparece en su esquina con minutos → «Avisarme» → aparece en `/alertas`. Repetir en modo oscuro, alto contraste y texto al 200 %. Cortar red: aparece estimación histórica o «sin datos», nunca minutos viejos como en vivo.
- [ ] **Step 4: Android** — `gradlew testDebugUnitTest assembleDebug` OK.
- [ ] **Step 5: Docs** — `testing-results.md` (ciclo 14 con lo medido), `progress.md`, `decisions.md` (D19: marca configurable, sin publicidad ni rastreo, Inicio por esquina, búsqueda local), `privacy/data-inventory.md` (sin Analytics/Clarity/AdSense/MercadoPago), `blockers.md` (B11 resuelto; B12 resuelto en mercadopago).
- [ ] **Step 6: Commit y push** — `docs: verificación de marca propia y experiencia simple`; `git push origin feature/next-gen-platform`.

---

## Orden y dependencias

1 → 2 → 3 → 4 (marca y limpieza, secuenciales: tocan los mismos archivos).
5, 6, 7, 8, 9, 10 son independientes entre sí (lógica pura) y sólo dependen de 1.
11 depende de 5–9. 12 depende de 3 y 11. 13 depende de 6 y 10. 14 es independiente. 15 depende de 11 y 13. 16 al final.
