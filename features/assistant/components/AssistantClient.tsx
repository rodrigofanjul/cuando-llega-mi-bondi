"use client";

import { useId, useMemo, useRef, useState } from "react";

import { resolveFavoritoLinea } from "@features/favorites/resolveFavoritoLinea";
import { useFavoritos } from "@features/favorites/hooks/useFavoritos";
import { useSearchFlowData } from "@features/search/context/SearchFlowContext";
import { PageHeader } from "@shared/layout/PageHeader";
import { PageShell } from "@shared/layout/PageShell";
import { Button } from "@shared/ui";

interface Turn {
    role: "user" | "assistant";
    text: string;
    meta?: string;
}

const EXAMPLES = ["¿Cuándo llega el bondi a Casa?", "¿Qué línea llega primero?", "¿Hay demoras en Trabajo?", "¿Cómo llego a Playa Grande?"];

export function AssistantClient() {
    const inputId = useId();
    const { favoritos } = useFavoritos();
    const { lineas } = useSearchFlowData();
    const [turns, setTurns] = useState<Turn[]>([]);
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const [origen, setOrigen] = useState<{ lat: number; lng: number } | null>(null);
    const [geoMsg, setGeoMsg] = useState<string | null>(null);
    const listRef = useRef<HTMLOListElement>(null);

    const favContext = useMemo(() => {
        const map = new Map<string, string>();
        for (const l of lineas) if (l.Descripcion?.trim()) map.set(l.Descripcion.trim(), l.CodigoLineaParada);
        return favoritos.flatMap((f) => {
            const lineCode = resolveFavoritoLinea(f, map);
            if (!lineCode) return [];
            const stopLabel = [f.calleLabel, f.interseccionLabel].filter(Boolean).join(" y ") || f.nombre;
            return [{ nombre: f.nombre, stopId: f.identificadorParada, stopLabel, lineCode, lineLabel: (f.lineaLabel || f.descripcionLinea || lineCode).trim() }];
        });
    }, [favoritos, lineas]);

    const send = async (message: string) => {
        const q = message.trim();
        if (!q || busy) return;
        setTurns((t) => [...t, { role: "user", text: q }]);
        setText("");
        setBusy(true);
        try {
            const res = await fetch("/api/assistant", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ message: q, context: { favoritos: favContext, origen } }),
            });
            const body = (await res.json()) as { answer?: string; provider?: string; grounded?: boolean };
            const meta =
                body.provider === "mock"
                    ? "Asistente simulado (reglas, sin IA) · datos de la app"
                    : body.grounded === false
                      ? "Respuesta armada sólo con datos verificados"
                      : body.provider
                        ? "Generado con IA a partir de datos de la app"
                        : undefined;
            setTurns((t) => [...t, { role: "assistant", text: body.answer ?? "No pude responder.", meta }]);
        } catch {
            setTurns((t) => [...t, { role: "assistant", text: "No pude conectarme. Probá de nuevo." }]);
        } finally {
            setBusy(false);
            requestAnimationFrame(() => listRef.current?.lastElementChild?.scrollIntoView({ block: "end" }));
        }
    };

    const shareLocation = () => {
        if (!("geolocation" in navigator)) return setGeoMsg("Este dispositivo no permite obtener la ubicación.");
        navigator.geolocation.getCurrentPosition(
            (p) => {
                setOrigen({ lat: p.coords.latitude, lng: p.coords.longitude });
                setGeoMsg("Ubicación compartida para esta conversación (se envía redondeada a ~100 m, no se guarda).");
            },
            () => setGeoMsg("No pudimos obtener tu ubicación."),
            { enableHighAccuracy: false, maximumAge: 120_000, timeout: 10_000 },
        );
    };

    return (
        <PageShell>
            <PageHeader title="Asistente" subtitle="Preguntá sobre tus colectivos" />
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                Responde con los datos de la app (arribos, paradas, recorridos). No inventa horarios: si falta un dato, te lo pide. Usa tus
                favoritos como contexto; la conversación no se guarda.
            </p>

            <ol ref={listRef} aria-live="polite" className="mt-4 flex flex-col gap-2">
                {turns.map((t, i) => (
                    <li
                        key={i}
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-[14px] ${
                            t.role === "user" ? "self-end bg-accent text-white" : "self-start bg-foreground/[0.06] text-foreground"
                        }`}
                    >
                        <span className="sr-only">{t.role === "user" ? "Vos: " : "Asistente: "}</span>
                        {t.text}
                        {t.meta ? <span className="mt-1 block text-[11px] text-muted-foreground">{t.meta}</span> : null}
                    </li>
                ))}
                {busy ? <li className="self-start text-[13px] text-muted-foreground">Buscando datos…</li> : null}
            </ol>

            {turns.length === 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                    {EXAMPLES.map((e) => (
                        <button key={e} type="button" onClick={() => void send(e)} className="min-h-9 rounded-full bg-foreground/[0.07] px-3 text-[12px] font-semibold text-foreground">
                            {e}
                        </button>
                    ))}
                </div>
            ) : null}

            <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    void send(text);
                }}
            >
                <label htmlFor={inputId} className="sr-only">
                    Tu pregunta
                </label>
                <input
                    id={inputId}
                    value={text}
                    maxLength={500}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Ej.: ¿cuándo llega el 531 a Casa?"
                    className="min-h-11 flex-1 rounded-xl border border-border bg-background px-3 text-[15px] text-foreground"
                />
                <Button type="submit" variant="primary" disabled={busy || !text.trim()}>
                    Enviar
                </Button>
            </form>
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={shareLocation} disabled={origen !== null}>
                    {origen ? "Ubicación compartida" : "Compartir mi ubicación (para «cómo llego»)"}
                </Button>
                {geoMsg ? <p className="text-[12px] text-muted-foreground">{geoMsg}</p> : null}
            </div>
        </PageShell>
    );
}
