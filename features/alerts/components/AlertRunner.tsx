"use client";

import { useEffect, useRef } from "react";

import type { Arribo } from "@features/arrivals/types";
import { activeQueries, runAlertCycle } from "@features/alerts/lib/runner";
import { deliverNotification } from "@features/alerts/native/notifier";
import { useAlertsStore } from "@features/alerts/store/useAlertsStore";
import { postWithMeta } from "@shared/api/client";

const CYCLE_MS = 60_000;

/** Usa el cliente existente; no agrega fuentes ni modifica la conexión. */
async function fetchArribos(stopId: string, lineCode: string) {
    const res = await postWithMeta("RecuperarProximosArribosW", {
        identificadorParada: stopId,
        codigoLineaParada: lineCode,
    });
    const data = res.data as { arribos?: Arribo[] } | null;
    return { arribos: data?.arribos ?? [], stale: res.meta.cache === "STALE" };
}

/**
 * Ejecutor local de alertas: sólo con la app abierta y visible. No consulta
 * nada si no hay reglas activas en este horario.
 */
export function AlertRunner() {
    const running = useRef(false);

    useEffect(() => {
        const tick = async () => {
            if (running.current || document.visibilityState !== "visible") return;
            const { rules, engineState, applyCycle } = useAlertsStore.getState();
            const now = Date.now();
            const hasExpiredOnce = rules.some((r) => r.schedule.type === "once");
            if (activeQueries(rules, now).length === 0 && !hasExpiredOnce) return;
            running.current = true;
            try {
                const result = await runAlertCycle(rules, engineState, { now: () => now, fetchArribos, notify: deliverNotification });
                applyCycle(result, now);
            } finally {
                running.current = false;
            }
        };
        const onVisible = () => {
            if (document.visibilityState === "visible") void tick();
        };
        void tick();
        const id = window.setInterval(() => void tick(), CYCLE_MS);
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            window.clearInterval(id);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, []);

    return null;
}
