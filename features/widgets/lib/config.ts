/**
 * Configuración de widgets (contrato v1). La app web la valida y la entrega a
 * los widgets nativos a través del plugin `BondiWidget`; el JSON resultante es
 * lo que leen Kotlin (SharedPreferences) y Swift (App Group).
 */
import { z } from "zod";

import { parseHhMm } from "@shared/time/argentina";

export const WIDGET_CONFIG_VERSION = 1 as const;
export const MAX_MULTI_TARGETS = 8;
export const MAX_CONFIGS = 20;

const hhmm = z.string().refine((v) => parseHhMm(v) !== null, "Hora inválida (HH:MM)");
const nonEmpty = z.string().trim().min(1).max(80);

/** Una combinación parada + línea/sentido. `lineCode` = `CodigoLineaParada`. */
export const widgetTargetSchema = z.object({
    stopId: nonEmpty,
    stopLabel: nonEmpty,
    lineCode: nonEmpty,
    lineLabel: nonEmpty,
    /** Sentido/destino elegido; vacío = cualquier sentido de esa línea en la parada. */
    destination: z.string().trim().max(80).default(""),
});
export type WidgetTarget = z.infer<typeof widgetTargetSchema>;

export const placeKindSchema = z.enum(["home", "work", "university", "other"]);
export type PlaceKind = z.infer<typeof placeKindSchema>;

export const smartSlotSchema = z
    .object({
        place: placeKindSchema,
        label: nonEmpty,
        days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
        from: hhmm,
        to: hhmm,
        targets: z.array(widgetTargetSchema).min(1).max(MAX_MULTI_TARGETS),
    })
    .refine((s) => new Set(s.days).size === s.days.length, "Días repetidos");
export type SmartSlot = z.infer<typeof smartSlotSchema>;

export const displaySchema = z.object({
    maxRows: z.number().int().min(1).max(6).default(3),
    showSecondArrival: z.boolean().default(true),
    /** `corrected` sólo se usa si existe un modelo publicado; si no, cae a oficial. */
    predictionSource: z.enum(["official", "corrected"]).default("official"),
});

const base = {
    version: z.literal(WIDGET_CONFIG_VERSION),
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
    name: nonEmpty,
    display: displaySchema.default({}),
};

export const widgetConfigSchema = z.discriminatedUnion("kind", [
    z.object({ ...base, kind: z.literal("single"), targets: z.array(widgetTargetSchema).length(1) }),
    z.object({
        ...base,
        kind: z.literal("multi"),
        targets: z.array(widgetTargetSchema).min(1).max(MAX_MULTI_TARGETS),
    }),
    z.object({
        ...base,
        kind: z.literal("smart"),
        slots: z.array(smartSlotSchema).min(1).max(10),
        /** Qué mostrar fuera de toda franja. Vacío = mensaje "sin recorrido para este horario". */
        fallbackTargets: z.array(widgetTargetSchema).max(MAX_MULTI_TARGETS).default([]),
    }),
]);
export type WidgetConfig = z.infer<typeof widgetConfigSchema>;

export const widgetConfigListSchema = z
    .array(widgetConfigSchema)
    .max(MAX_CONFIGS)
    .refine((list) => new Set(list.map((c) => c.id)).size === list.length, "IDs repetidos");

export type ParseResult =
    | { ok: true; configs: WidgetConfig[] }
    | { ok: false; error: string };

/**
 * Lee configuraciones persistidas. Nunca lanza: una configuración corrupta no
 * debe tirar abajo la app ni el widget.
 */
export function parseWidgetConfigs(raw: unknown): ParseResult {
    const result = widgetConfigListSchema.safeParse(raw);
    if (result.success) return { ok: true, configs: result.data };
    const issue = result.error.issues[0];
    return { ok: false, error: `${issue.path.join(".") || "(raíz)"}: ${issue.message}` };
}

/** Todos los pares (parada, línea) únicos que un conjunto de configs necesita consultar. */
export function requiredQueries(configs: WidgetConfig[]): { stopId: string; lineCode: string }[] {
    const seen = new Map<string, { stopId: string; lineCode: string }>();
    const add = (t: WidgetTarget) => {
        const key = `${t.stopId}|${t.lineCode}`;
        if (!seen.has(key)) seen.set(key, { stopId: t.stopId, lineCode: t.lineCode });
    };
    for (const c of configs) {
        if (c.kind === "smart") {
            c.slots.forEach((s) => s.targets.forEach(add));
            c.fallbackTargets.forEach(add);
        } else {
            c.targets.forEach(add);
        }
    }
    return [...seen.values()];
}
