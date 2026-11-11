"use client";

import { useId, useState } from "react";
import useSWR from "swr";

import { OCCUPANCY_LEVELS, REPORT_LABEL, REPORT_TYPES, type OccupancyLevel, type ReportType } from "@features/reports/lib/reports";

interface ReportsResponse {
    clusters: { type: ReportType; reporters: number; label: string; confirmed: false }[];
    occupancy: { level: OccupancyLevel | "informacion_insuficiente"; reporters: number; provenance: string };
}

class Unavailable extends Error {}

async function fetchReports(url: string): Promise<ReportsResponse> {
    const res = await fetch(url);
    if (res.status === 503) throw new Unavailable("reports_unavailable");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

const DEVICE_KEY = "bondi:device-id";

/** Id aleatorio del dispositivo para antispam (el servidor guarda sólo un hash con sal). */
function deviceId(): string {
    try {
        let id = localStorage.getItem(DEVICE_KEY);
        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem(DEVICE_KEY, id);
        }
        return id;
    } catch {
        return crypto.randomUUID();
    }
}

const OCC_LABEL: Record<OccupancyLevel, string> = { baja: "Baja", media: "Media", alta: "Alta" };

interface Props {
    readonly lineCode: string;
    readonly stopId: string;
}

export function CommunityReports({ lineCode, stopId }: Props) {
    const key = lineCode ? `/api/reports?lineCode=${encodeURIComponent(lineCode)}&stopId=${encodeURIComponent(stopId)}` : null;
    const { data, error, mutate } = useSWR<ReportsResponse>(key, fetchReports, {
        refreshInterval: 60_000,
        revalidateOnFocus: false,
        shouldRetryOnError: (e) => !(e instanceof Unavailable),
    });
    if (error instanceof Unavailable || (!data && error)) return null;

    return (
        <div className="rounded-[12px] border border-border px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">Comunidad · no confirmado</p>
            {data?.occupancy && data.occupancy.level !== "informacion_insuficiente" ? (
                <p className="mt-1 text-[13px] text-foreground">
                    Ocupación estimada: <strong>{OCC_LABEL[data.occupancy.level]}</strong>
                    <span className="block text-[11px] text-muted-foreground">{data.occupancy.provenance}</span>
                </p>
            ) : null}
            {data?.clusters.map((c) => (
                <p key={c.type} className="mt-1 text-[13px] text-foreground">
                    {c.label}
                </p>
            ))}
            {data && data.clusters.length === 0 && data.occupancy.level === "informacion_insuficiente" ? (
                <p className="mt-1 text-[12px] text-muted-foreground">Sin reportes de otras personas para esta línea.</p>
            ) : null}
            <ReportForm lineCode={lineCode} stopId={stopId} onSent={() => void mutate()} />
        </div>
    );
}

function ReportForm({ lineCode, stopId, onSent }: { readonly lineCode: string; readonly stopId: string; readonly onSent: () => void }) {
    const typeId = useId();
    const textId = useId();
    const [type, setType] = useState<ReportType>("ocupacion");
    const [occupancy, setOccupancy] = useState<OccupancyLevel>("media");
    const [text, setText] = useState("");
    const [state, setState] = useState<"idle" | "sending" | "sent" | "pending" | "error" | "limited">("idle");

    const send = async () => {
        setState("sending");
        try {
            const res = await fetch("/api/reports", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    type,
                    lineCode,
                    stopId: stopId || null,
                    occupancy: type === "ocupacion" ? occupancy : null,
                    text: text.trim() || null,
                    deviceId: deviceId(),
                }),
            });
            if (res.status === 429) return setState("limited");
            if (!res.ok) return setState("error");
            const body = (await res.json()) as { status: string };
            setState(body.status === "pending" ? "pending" : "sent");
            setText("");
            onSent();
        } catch {
            setState("error");
        }
    };

    const messages: Partial<Record<typeof state, string>> = {
        sent: "Gracias. Se muestra cuando otra persona reporta lo mismo.",
        pending: "Gracias. Tu comentario quedó en revisión.",
        error: "No se pudo enviar. Probá de nuevo.",
        limited: "Enviaste varios reportes seguidos. Probá en unos minutos.",
    };

    return (
        <details className="mt-2">
            <summary className="cursor-pointer text-[13px] font-semibold text-foreground">Reportar algo</summary>
            <form
                className="mt-2 flex flex-col gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                }}
            >
                <label htmlFor={typeId} className="text-[12px] text-muted-foreground">
                    ¿Qué pasa?
                </label>
                <select id={typeId} value={type} onChange={(e) => setType(e.target.value as ReportType)} className="min-h-10 rounded-lg border border-border bg-background px-2 text-[14px]">
                    {REPORT_TYPES.map((t) => (
                        <option key={t} value={t}>
                            {REPORT_LABEL[t]}
                        </option>
                    ))}
                </select>
                {type === "ocupacion" ? (
                    <fieldset className="flex gap-3">
                        <legend className="sr-only">Nivel de ocupación</legend>
                        {OCCUPANCY_LEVELS.map((l) => (
                            <label key={l} className="flex items-center gap-1.5 text-[13px] text-foreground">
                                <input type="radio" name={`occ-${typeId}`} checked={occupancy === l} onChange={() => setOccupancy(l)} />
                                {OCC_LABEL[l]}
                            </label>
                        ))}
                    </fieldset>
                ) : null}
                <label htmlFor={textId} className="text-[12px] text-muted-foreground">
                    Comentario (opcional, sin datos personales)
                </label>
                <textarea
                    id={textId}
                    maxLength={200}
                    rows={2}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="rounded-lg border border-border bg-background px-2 py-1 text-[14px]"
                />
                <button type="submit" disabled={state === "sending"} className="min-h-10 rounded-lg bg-foreground/[0.07] px-3 text-[13px] font-semibold text-foreground">
                    {state === "sending" ? "Enviando…" : "Enviar reporte"}
                </button>
                {messages[state] ? (
                    <p role="status" className="text-[12px] text-muted-foreground">
                        {messages[state]}
                    </p>
                ) : null}
            </form>
        </details>
    );
}
