"use client";

import { useState } from "react";

import type { Arribo } from "@features/arrivals/types";
import { normalizeArribo } from "@features/arrivals/lib/normalize";
import { LEVEL_LABEL, detectAnomalies, mostRelevant, type SeriesPoint } from "@features/anomalies/lib/detect";

const MAX_POINTS = 20;

interface Props {
    readonly arribos: Arribo[];
    readonly paradaId: string;
    readonly codLinea: string;
    readonly lastUpdate: Date | null;
    readonly stale: boolean;
}

/**
 * Aviso de demora/anomalía sobre la serie de consultas de esta sesión (las
 * mismas que ya hace el panel: sin requests extra). Muestra el nivel de
 * evidencia y nunca atribuye causas.
 */
export function AnomalyNotice({ arribos, paradaId, codLinea, lastUpdate, stale }: Props) {
    const scope = `${paradaId}|${codLinea}`;
    const at = lastUpdate?.getTime() ?? null;
    const [series, setSeries] = useState<{ scope: string; lastAt: number | null; points: SeriesPoint[] }>({
        scope,
        lastAt: null,
        points: [],
    });

    // Ajuste de estado durante el render: nueva consulta o cambio de parada/línea.
    if (series.scope !== scope) {
        setSeries({ scope, lastAt: null, points: [] });
    } else if (at !== null && !stale && series.lastAt !== at) {
        const point: SeriesPoint = {
            at,
            arrivals: arribos.map((a) => normalizeArribo(a, { stopId: paradaId, lineCode: codLinea, fetchedAt: at })),
        };
        setSeries({ scope, lastAt: at, points: [...series.points, point].slice(-MAX_POINTS) });
    }

    if (stale || series.points.length === 0) return null;
    const signal = mostRelevant(detectAnomalies(series.points));
    if (!signal) return null;

    const tone =
        signal.level === "demora_confirmada" || signal.level === "demora_estimada"
            ? "border-amarillo/50 bg-amarillo/10"
            : "border-border bg-foreground/[0.04]";
    return (
        <div role="status" className={`rounded-[12px] border px-4 py-3 ${tone}`}>
            <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">{LEVEL_LABEL[signal.level]}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-foreground">{signal.message}</p>
        </div>
    );
}
