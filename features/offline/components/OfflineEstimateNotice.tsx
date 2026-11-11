"use client";

import { useSyncExternalStore } from "react";

import { resolveOfflineState } from "@features/offline/lib/profiles";
import { useOfflineStore } from "@features/offline/store/useOfflineStore";
import { formatArClock } from "@shared/time/argentina";

function subscribeOnline(cb: () => void) {
    window.addEventListener("online", cb);
    window.addEventListener("offline", cb);
    return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
    };
}

function formatSync(iso: string | null, ms: number | null): string {
    const at = ms ?? (iso ? Date.parse(iso) : NaN);
    if (!Number.isFinite(at)) return "nunca";
    const d = new Date(at);
    return `${d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} ${formatArClock(at)}`;
}

interface Props {
    readonly stopId: string;
    readonly lineCode: string;
    readonly lineLabel: string;
    /** La consulta en vivo falló por red (aunque el navegador diga que hay conexión). */
    readonly liveFailed: boolean;
    readonly now: number;
}

/** Estimación histórica sin conexión (§24). Nunca se muestra como arribo en vivo. */
export function OfflineEstimateNotice({ stopId, lineCode, lineLabel, liveFailed, now }: Props) {
    const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
    const profile = useOfflineStore((s) => s.current);
    const freqs = useOfflineStore((s) => s.frequencies);
    const freqSource = useOfflineStore((s) => s.frequenciesSource);
    const syncedAt = useOfflineStore((s) => s.syncedAt);

    const state = resolveOfflineState({ online: online && !liveFailed, profile, freqs, stopId, lineCode, lineLabel, now });
    if (state.state === "ONLINE") return null;

    return (
        <div role="status" className="rounded-[12px] border border-border bg-foreground/[0.04] px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">
                {state.state === "OFFLINE_MODEL" ? "Sin conexión · estimación histórica" : "Sin conexión"}
            </p>
            <p className="mt-1 text-[13px] text-foreground">{state.label}.</p>
            {state.state === "OFFLINE_MODEL" ? (
                <p className="mt-1 text-[14px] text-foreground">
                    Próxima llegada probable en <strong>~{state.estimate.waitMedianMin} min</strong> (entre {state.estimate.waitLowMin} y{" "}
                    {state.estimate.waitHighMin} min).
                    <span className="block text-[11px] text-muted-foreground">
                        Basado en {state.estimate.days} días observados a esta hora. Última sincronización: {formatSync(state.syncedAt, syncedAt)}.
                    </span>
                </p>
            ) : (
                <p className="mt-1 text-[13px] text-foreground">
                    {state.scheduledHeadwayMin !== null
                        ? `Frecuencia publicada aproximada en esta franja: cada ${state.scheduledHeadwayMin} min.`
                        : "No hay horarios ni historial disponibles para esta línea."}
                    {state.scheduledHeadwayMin !== null && freqSource ? (
                        <span className="block text-[11px] text-muted-foreground">Fuente: {freqSource}. No es un arribo en tiempo real.</span>
                    ) : null}
                </p>
            )}
        </div>
    );
}
