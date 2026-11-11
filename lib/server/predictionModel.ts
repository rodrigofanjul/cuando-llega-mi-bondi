import { readFile } from "node:fs/promises";

import { artifactSchema, type ModelArtifact } from "@features/prediction/lib/model";

/**
 * Carga perezosa (una vez por proceso) del artefacto de predicción indicado en
 * PREDICTION_MODEL_PATH. Si falta o es inválido → null (la API usa el ETA oficial).
 */
let cached: { path: string; artifact: ModelArtifact | null } | null = null;

export async function loadPredictionModel(): Promise<ModelArtifact | null> {
    const path = process.env.PREDICTION_MODEL_PATH?.trim();
    if (!path) return null;
    if (cached?.path === path) return cached.artifact;
    try {
        const parsed = artifactSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
        cached = { path, artifact: parsed.success ? parsed.data : null };
        if (!parsed.success) console.error("[predict] artefacto inválido; se usa el ETA oficial");
    } catch {
        console.error("[predict] no se pudo leer el artefacto; se usa el ETA oficial");
        cached = { path, artifact: null };
    }
    return cached.artifact;
}

/** Sólo tests. */
export function resetPredictionModelCache() {
    cached = null;
}
