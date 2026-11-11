/**
 * Inferencia liviana del modelo de corrección de ETA (artefacto de ml/bondi_ml/export.py).
 * Sin dependencias: evalúa árboles LightGBM exportados o una tabla de sesgo.
 *
 * Política: sólo se usa un modelo PUBLICABLE entrenado con datos REALES. En
 * cualquier otro caso se devuelve el ETA oficial (fallback) y se informa el motivo.
 * Nunca se presentan valores sintéticos como predicciones reales.
 */
import { z } from "zod";

const nodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
    z.union([
        z.object({ v: z.number() }),
        z.object({
            f: z.number().int().min(0),
            t: z.number(),
            d: z.union([z.literal(0), z.literal(1)]),
            m: z.string(),
            l: nodeSchema,
            r: nodeSchema,
        }),
    ]),
);

export type TreeNode = { v: number } | { f: number; t: number; d: 0 | 1; m: string; l: TreeNode; r: TreeNode };

export const FEATURES = [
    "eta_minutes",
    "hour_sin",
    "hour_cos",
    "weekday",
    "is_weekend",
    "is_holiday",
    "line_idx",
    "stop_idx",
    "deviation_minutes",
] as const;

export const artifactSchema = z.object({
    schema_version: z.literal(1),
    model_version: z.string(),
    kind: z.enum(["lightgbm_residual", "bias_table"]),
    data_source: z.string(),
    created_at: z.string(),
    calendar_version: z.string(),
    features: z.array(z.string()),
    maps: z.object({ line_code: z.record(z.string(), z.number()), stop_id: z.record(z.string(), z.number()) }),
    interval: z.object({ q_low: z.number(), q_high: z.number(), nominal: z.number() }),
    trees: z.array(nodeSchema).nullable(),
    bias_table: z.record(z.string(), z.number()).nullable(),
    metrics: z.record(z.string(), z.unknown()),
    gate: z.object({ publishable: z.boolean(), reasons: z.array(z.string()) }),
    parity_cases: z.array(z.unknown()).default([]),
});
export type ModelArtifact = z.infer<typeof artifactSchema>;

/** Feriados nacionales inamovibles (mismo listado que ml/bondi_ml/calendar.py). */
const FIXED_HOLIDAYS = new Set(["1-1", "3-24", "4-2", "5-1", "5-25", "6-20", "7-9", "12-8", "12-25"]);
const AR_OFFSET_MS = -3 * 3_600_000;

export interface PredictionInput {
    officialEtaMinutes: number;
    observedAt: number;
    lineCode: string;
    stopId: string;
    deviationMinutes: number | null;
}

/** Igual a dataset.add_features (Python). Valores desconocidos de línea/parada → -1. */
export function buildFeatures(input: PredictionInput, maps: ModelArtifact["maps"]): number[] {
    const local = new Date(input.observedAt + AR_OFFSET_MS);
    const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
    const weekday = (local.getUTCDay() + 6) % 7; // lunes = 0, como Python
    const holiday = FIXED_HOLIDAYS.has(`${local.getUTCMonth() + 1}-${local.getUTCDate()}`) ? 1 : 0;
    return [
        input.officialEtaMinutes,
        Math.sin((2 * Math.PI * hour) / 24),
        Math.cos((2 * Math.PI * hour) / 24),
        weekday,
        weekday >= 5 ? 1 : 0,
        holiday,
        maps.line_code[input.lineCode] ?? -1,
        maps.stop_id[input.stopId] ?? -1,
        input.deviationMinutes ?? 0,
    ];
}

function goesLeft(node: Extract<TreeNode, { f: number }>, raw: number): boolean {
    let x = raw;
    if (Number.isNaN(x)) {
        if (node.m === "NaN") return node.d === 1;
        x = 0;
    }
    if (node.m === "Zero" && x === 0) return node.d === 1;
    return x <= node.t;
}

export function evaluateTrees(trees: TreeNode[], x: number[]): number {
    let total = 0;
    for (const root of trees) {
        let node = root;
        while (!("v" in node)) node = goesLeft(node, x[node.f]) ? node.l : node.r;
        total += node.v;
    }
    return total;
}

export function rawPrediction(artifact: ModelArtifact, input: PredictionInput): number {
    if (artifact.kind === "lightgbm_residual") {
        const x = buildFeatures(input, artifact.maps);
        return Math.max(0, input.officialEtaMinutes + evaluateTrees(artifact.trees ?? [], x));
    }
    const local = new Date(input.observedAt + AR_OFFSET_MS);
    const lineIdx = artifact.maps.line_code[input.lineCode] ?? -1;
    const factor = artifact.bias_table?.[`${lineIdx}|${local.getUTCHours()}`] ?? 1;
    return input.officialEtaMinutes * factor;
}

export type FallbackReason = "no_model" | "not_publishable" | "synthetic_data" | "eta_out_of_range";

export interface PredictionResult {
    officialEtaMinutes: number;
    correctedEtaMinutes: number | null;
    interval: { low: number; high: number; nominal: number } | null;
    /** `official` = sin corrección (fallback); `model` = corrección validada. */
    quality: "official" | "model";
    modelVersion: string | null;
    computedAt: number;
    fallbackReason: FallbackReason | null;
}

export interface PredictOptions {
    /** Sólo tests/desarrollo: permite artefactos sintéticos (marcados en el resultado). */
    allowSynthetic?: boolean;
    now: number;
}

export function predict(artifact: ModelArtifact | null, input: PredictionInput, o: PredictOptions): PredictionResult {
    const official: PredictionResult = {
        officialEtaMinutes: input.officialEtaMinutes,
        correctedEtaMinutes: null,
        interval: null,
        quality: "official",
        modelVersion: null,
        computedAt: o.now,
        fallbackReason: null,
    };
    if (!artifact) return { ...official, fallbackReason: "no_model" };
    const synthetic = artifact.data_source !== "real";
    if (synthetic && !o.allowSynthetic) return { ...official, fallbackReason: "synthetic_data" };
    if (!artifact.gate.publishable && !o.allowSynthetic) return { ...official, fallbackReason: "not_publishable" };
    // Fuera del rango de entrenamiento (1–60 min) no se corrige.
    if (input.officialEtaMinutes < 1 || input.officialEtaMinutes > 60) return { ...official, fallbackReason: "eta_out_of_range" };

    const pred = rawPrediction(artifact, input);
    const s = 1 + 0.1 * input.officialEtaMinutes;
    const round1 = (n: number) => Math.round(n * 10) / 10;
    return {
        ...official,
        correctedEtaMinutes: round1(pred),
        interval: {
            low: round1(Math.max(0, pred + artifact.interval.q_low * s)),
            high: round1(pred + artifact.interval.q_high * s),
            nominal: artifact.interval.nominal,
        },
        quality: "model",
        modelVersion: artifact.model_version,
    };
}
