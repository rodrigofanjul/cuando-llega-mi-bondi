"use client";

import { useId, useState } from "react";

import type { Arribo } from "@features/arrivals/types";
import { describeRecommendation, walkMinutes, type Recommendation } from "@features/departure/lib/advisor";
import { adviseFromArrivals, stopCoordinates, type Advice } from "@features/departure/lib/fromArrivals";

const WALK_KEY = "bondi:walk-min";

/** Minutos de caminata por parada (preferencia local; nunca se guardan coordenadas). */
function readWalk(stopId: string): number {
    try {
        const v = (JSON.parse(localStorage.getItem(WALK_KEY) ?? "{}") as Record<string, number>)[stopId];
        return Number.isFinite(v) ? v : 5;
    } catch {
        return 5;
    }
}

function writeWalk(stopId: string, minutes: number) {
    try {
        const all = JSON.parse(localStorage.getItem(WALK_KEY) ?? "{}") as Record<string, number>;
        all[stopId] = minutes;
        localStorage.setItem(WALK_KEY, JSON.stringify(all));
    } catch {
        // Sin almacenamiento: la preferencia vive sólo en esta sesión.
    }
}

/** Caminata guardada para la parada, o null si el usuario nunca la ajustó. */
export function readStoredWalkMin(stopId: string): number | null {
    try {
        const v = (JSON.parse(localStorage.getItem(WALK_KEY) ?? "{}") as Record<string, number>)[stopId];
        return Number.isFinite(v) ? v : null;
    } catch {
        return null;
    }
}

const isRecommendation = (a: Advice | null): a is Recommendation => a !== null && a.kind !== "stale-data";

interface Props {
    readonly arribos: Arribo[];
    readonly paradaId: string;
    readonly codLinea: string;
    readonly lastUpdate: Date | null;
    readonly stale: boolean;
    /** Reloj del panel (se actualiza cada 10 s). */
    readonly now: number;
}

export function DepartureAdvisor({ arribos, paradaId, codLinea, lastUpdate, stale, now }: Props) {
    const walkId = useId();
    const marginId = useId();
    const [open, setOpen] = useState(false);
    const [walkMin, setWalkMin] = useState(() => (typeof window === "undefined" ? 5 : readWalk(paradaId)));
    const [marginMin, setMarginMin] = useState(2);
    const [geoMsg, setGeoMsg] = useState<string | null>(null);

    // Ajuste de estado durante el render (sin efectos) cuando cambian las entradas.
    const fetchedAt = lastUpdate?.getTime() ?? null;
    const key = `${open}|${now}|${fetchedAt}|${walkMin}|${marginMin}|${stale}|${arribos.map((a) => a.Arribo).join(",")}`;
    const [computed, setComputed] = useState<{ key: string; advice: Advice | null }>({ key: "", advice: null });
    if (open && fetchedAt !== null && computed.key !== key) {
        const prev = isRecommendation(computed.advice) ? computed.advice : null;
        setComputed({
            key,
            advice: adviseFromArrivals({ arribos, stopId: paradaId, lineCode: codLinea, walkMin, marginMin, fetchedAt, now, stale }, prev),
        });
    }

    const estimateFromLocation = () => {
        const stop = stopCoordinates(arribos);
        if (!stop) return setGeoMsg("La parada no informa coordenadas: ingresá los minutos a mano.");
        if (!("geolocation" in navigator)) return setGeoMsg("Este dispositivo no permite obtener la ubicación.");
        setGeoMsg("Obteniendo ubicación…");
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const minutes = walkMinutes({ lat: pos.coords.latitude, lng: pos.coords.longitude }, stop);
                setWalkMin(minutes);
                writeWalk(paradaId, minutes);
                setGeoMsg(`Estimado en línea recta con desvío por calles: ${minutes} min. Podés ajustarlo.`);
            },
            () => setGeoMsg("No pudimos obtener tu ubicación. Ingresá los minutos a mano."),
            { enableHighAccuracy: false, maximumAge: 120_000, timeout: 10_000 },
        );
    };

    const advice = open ? computed.advice : null;
    let message: string | null = null;
    if (advice?.kind === "stale-data") message = "Los arribos están desactualizados: actualizá antes de decidir cuándo salir.";
    else if (advice) message = describeRecommendation(advice, now);

    return (
        <details
            className="rounded-[12px] border border-border px-4 py-3"
            onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
            <summary className="cursor-pointer text-[14px] font-semibold text-foreground">¿Cuándo salgo?</summary>
            <div className="mt-3 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                    <label htmlFor={walkId} className="text-[13px] text-foreground">
                        Caminata (min)
                    </label>
                    <input
                        id={walkId}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={60}
                        value={walkMin}
                        onChange={(e) => {
                            const v = Math.max(0, Math.min(60, Number(e.target.value) || 0));
                            setWalkMin(v);
                            writeWalk(paradaId, v);
                        }}
                        className="min-h-10 w-20 rounded-lg border border-border bg-background px-2 text-[15px] text-foreground"
                    />
                    <label htmlFor={marginId} className="text-[13px] text-foreground">
                        Margen (min)
                    </label>
                    <input
                        id={marginId}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={30}
                        value={marginMin}
                        onChange={(e) => setMarginMin(Math.max(0, Math.min(30, Number(e.target.value) || 0)))}
                        className="min-h-10 w-20 rounded-lg border border-border bg-background px-2 text-[15px] text-foreground"
                    />
                    <button type="button" onClick={estimateFromLocation} className="min-h-10 rounded-lg bg-foreground/[0.07] px-3 text-[13px] font-semibold text-foreground">
                        Usar mi ubicación
                    </button>
                </div>
                {geoMsg ? <p className="text-[12px] text-muted-foreground">{geoMsg}</p> : null}
                <p aria-live="polite" className="text-[14px] leading-relaxed text-foreground">
                    {message ?? "Calculando…"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                    Incluye un margen por la variabilidad del ETA oficial. La recomendación no cambia por variaciones chicas.
                </p>
            </div>
        </details>
    );
}
