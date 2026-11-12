"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { alertDraftToRule, describeRule, newAlertDraft, type AlertDraft, type TriggerKind } from "@features/alerts/lib/draft";
import { getNotificationPermission, requestNotificationPermission, type PermissionStatus } from "@features/alerts/native/notifier";
import { MAX_ALERT_RULES, useAlertsStore } from "@features/alerts/store/useAlertsStore";
import { FavoritePicker } from "@features/favorites/components/FavoritePicker";
import { useFavoritos } from "@features/favorites/hooks/useFavoritos";
import type { Favorito } from "@features/favorites/types";
import { useSearchFlowData } from "@features/search/context/SearchFlowContext";
import { DAY_LABELS } from "@features/widgets/lib/draft";
import { usePersistHydration } from "@shared/hooks/usePersistHydration";
import { PageHeader } from "@shared/layout/PageHeader";
import { PageShell } from "@shared/layout/PageShell";
import { Button, Card } from "@shared/ui";

const TRIGGERS: { value: TriggerKind; label: string }[] = [
    { value: "eta-threshold", label: "Cuando esté a N minutos" },
    { value: "leave-home", label: "Cuándo salir de casa" },
    { value: "delay", label: "Si se demora" },
];

const inputClass = "min-h-10 w-20 rounded-lg border border-border bg-background px-2 text-[15px] text-foreground";

/** Sólo se llama desde handlers (guardar), nunca durante el render. */
function currentTime() {
    return Date.now();
}

function newId() {
    return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function PermissionBanner({ status, onRequest }: { readonly status: PermissionStatus | null; readonly onRequest: () => void }) {
    if (status === null || status === "granted") return null;
    const text: Record<Exclude<PermissionStatus, "granted">, string> = {
        prompt: "Para recibir avisos, permití las notificaciones.",
        denied: "Las notificaciones están bloqueadas. Habilitalas desde la configuración del navegador o del teléfono.",
        unsupported: "Este navegador no admite notificaciones.",
    };
    return (
        <Card className="mt-4 flex flex-col gap-2 p-3">
            <p className="text-[14px] text-foreground">{text[status]}</p>
            {status === "prompt" ? (
                <Button variant="primary" size="sm" onClick={onRequest}>
                    Permitir notificaciones
                </Button>
            ) : null}
        </Card>
    );
}

export function AlertsClient() {
    const { favoritos, isHydrated } = useFavoritos();
    const { lineas } = useSearchFlowData();
    const alertsReady = usePersistHydration(useAlertsStore);
    const rules = useAlertsStore((s) => s.rules);
    const lastUndelivered = useAlertsStore((s) => s.lastUndelivered);
    const { upsert, remove, toggle } = useAlertsStore.getState();
    const [draft, setDraft] = useState<AlertDraft | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [permission, setPermission] = useState<PermissionStatus | null>(null);

    useEffect(() => {
        let alive = true;
        getNotificationPermission()
            .then((p) => alive && setPermission(p))
            .catch(() => alive && setPermission("unsupported"));
        return () => {
            alive = false;
        };
    }, []);

    const map = useMemo(() => {
        const m = new Map<string, string>();
        for (const l of lineas) if (l.Descripcion?.trim()) m.set(l.Descripcion.trim(), l.CodigoLineaParada);
        return m;
    }, [lineas]);

    const save = () => {
        if (!draft) return;
        const r = alertDraftToRule(draft, favoritos, map, currentTime());
        if (!r.ok) return setError(r.error);
        if (!upsert(r.rule)) return setError(`Máximo ${MAX_ALERT_RULES} alertas.`);
        setDraft(null);
        setError(null);
    };

    const ready = isHydrated && alertsReady;

    return (
        <PageShell>
            <PageHeader title="Mis" highlight="alertas" subtitle="Avisos de arribo" />
            <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
                Te avisamos mientras Bondi MDP está abierta. Con la app cerrada todavía no podemos garantizar el aviso: los teléfonos no
                permiten consultas exactas en segundo plano.
            </p>

            <PermissionBanner status={permission} onRequest={() => void requestNotificationPermission().then(setPermission)} />
            {lastUndelivered > 0 && permission !== "granted" ? (
                <p role="status" className="mt-2 text-[13px] text-muted-foreground">
                    Hay {lastUndelivered} aviso(s) que no se pudieron mostrar por falta de permiso.
                </p>
            ) : null}

            {!ready ? (
                <div className="mt-6 h-16 animate-pulse rounded-2xl bg-foreground/[0.06]" aria-busy="true" aria-label="Cargando alertas" />
            ) : null}

            {ready && draft ? (
                <AlertEditor
                    draft={draft}
                    favoritos={favoritos}
                    error={error}
                    onChange={(update) => setDraft((d) => (d ? update(d) : d))}
                    onCancel={() => {
                        setDraft(null);
                        setError(null);
                    }}
                    onSave={save}
                />
            ) : null}

            {ready && !draft ? (
                <section className="mt-6" aria-label="Alertas guardadas">
                    {favoritos.length === 0 ? (
                        <Card className="p-4 text-[14px] text-muted-foreground">
                            Para crear una alerta primero guardá una parada en{" "}
                            <Link href="/favoritos" className="font-semibold text-accent hover:underline">
                                Favoritos
                            </Link>
                            .
                        </Card>
                    ) : null}
                    <ul className="flex flex-col gap-2.5">
                        {rules.map((r) => (
                            <li key={r.id}>
                                <Card className="flex items-center gap-3 p-3">
                                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                                        <input type="checkbox" checked={r.enabled} onChange={() => toggle(r.id)} aria-label="Alerta activa" />
                                        <span className={`min-w-0 text-[13px] ${r.enabled ? "text-foreground" : "text-muted-foreground line-through"}`}>
                                            {describeRule(r)}
                                        </span>
                                    </label>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        aria-label="Eliminar alerta"
                                        onClick={() => {
                                            if (window.confirm("¿Eliminar esta alerta?")) remove(r.id);
                                        }}
                                    >
                                        Eliminar
                                    </Button>
                                </Card>
                            </li>
                        ))}
                    </ul>
                    {favoritos.length > 0 ? (
                        <Button className="mt-4 w-full" variant="primary" onClick={() => setDraft(newAlertDraft(newId()))}>
                            Crear alerta
                        </Button>
                    ) : null}
                </section>
            ) : null}
        </PageShell>
    );
}

interface EditorProps {
    readonly draft: AlertDraft;
    readonly favoritos: Favorito[];
    readonly error: string | null;
    readonly onChange: (update: (d: AlertDraft) => AlertDraft) => void;
    readonly onCancel: () => void;
    readonly onSave: () => void;
}

function NumberField({ label, value, min, max, onChange }: { readonly label: string; readonly value: number; readonly min: number; readonly max: number; readonly onChange: (n: number) => void }) {
    return (
        <label className="flex items-center gap-2 text-[14px] text-foreground">
            <span>{label}</span>
            <input type="number" inputMode="numeric" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className={inputClass} />
        </label>
    );
}

function AlertEditor({ draft, favoritos, error, onChange, onCancel, onSave }: EditorProps) {
    const set = <K extends keyof AlertDraft>(k: K, v: AlertDraft[K]) => onChange((d) => ({ ...d, [k]: v }));
    const toggleDay = (day: number) =>
        onChange((d) => ({ ...d, days: d.days.includes(day) ? d.days.filter((x) => x !== day) : [...d.days, day].sort((a, b) => a - b) }));
    return (
        <form
            className="mt-6 flex flex-col gap-5"
            aria-label="Editor de alerta"
            onSubmit={(e) => {
                e.preventDefault();
                onSave();
            }}
        >
            <FavoritePicker legend="Paradas y líneas" favoritos={favoritos} selected={draft.favoriteIds} single={false} onChange={(ids) => set("favoriteIds", ids)} />

            <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-[13px] font-semibold text-foreground">Avisame</legend>
                {TRIGGERS.map((t) => (
                    <label key={t.value} className="flex items-center gap-3 text-[14px] text-foreground">
                        <input type="radio" name="alert-trigger" checked={draft.trigger === t.value} onChange={() => set("trigger", t.value)} />
                        {t.label}
                    </label>
                ))}
                {draft.trigger === "eta-threshold" ? <NumberField label="Minutos" value={draft.thresholdMin} min={1} max={60} onChange={(n) => set("thresholdMin", n)} /> : null}
                {draft.trigger === "leave-home" ? (
                    <>
                        <NumberField label="Minutos caminando hasta la parada" value={draft.walkMin} min={0} max={60} onChange={(n) => set("walkMin", n)} />
                        <NumberField label="Margen de seguridad (min)" value={draft.marginMin} min={0} max={30} onChange={(n) => set("marginMin", n)} />
                    </>
                ) : null}
                {draft.trigger === "delay" ? (
                    <>
                        <NumberField label="Demora mínima (min)" value={draft.minDelayMin} min={1} max={120} onChange={(n) => set("minDelayMin", n)} />
                        <p className="text-[12px] text-muted-foreground">Se basa en el desvío horario informado: es una demora estimada, no confirmada.</p>
                    </>
                ) : null}
            </fieldset>

            <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-[13px] font-semibold text-foreground">Cuándo</legend>
                <label className="flex items-center gap-3 text-[14px] text-foreground">
                    <input type="radio" name="alert-recurring" checked={draft.recurring} onChange={() => set("recurring", true)} />
                    Todas las semanas
                </label>
                <label className="flex items-center gap-3 text-[14px] text-foreground">
                    <input type="radio" name="alert-recurring" checked={!draft.recurring} onChange={() => set("recurring", false)} />
                    Sólo hoy
                </label>
                {draft.recurring ? (
                    <div role="group" aria-label="Días" className="flex flex-wrap gap-1.5">
                        {DAY_LABELS.map((d, day) => {
                            const on = draft.days.includes(day);
                            return (
                                <button
                                    key={d}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => toggleDay(day)}
                                    className={`min-h-9 min-w-11 rounded-lg px-2 text-[12px] font-semibold ${on ? "bg-accent text-white" : "bg-foreground/[0.07] text-foreground"}`}
                                >
                                    {d}
                                </button>
                            );
                        })}
                    </div>
                ) : null}
                <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-1 text-[14px] text-foreground">
                        <span>De</span>
                        <input type="time" value={draft.from} onChange={(e) => set("from", e.target.value)} className="min-h-10 rounded-lg border border-border bg-background px-2" />
                    </label>
                    <label className="flex items-center gap-1 text-[14px] text-foreground">
                        <span>a</span>
                        <input type="time" value={draft.to} onChange={(e) => set("to", e.target.value)} className="min-h-10 rounded-lg border border-border bg-background px-2" />
                    </label>
                </div>
                <p className="text-[12px] text-muted-foreground">Hora de Mar del Plata.</p>
            </fieldset>

            {error ? (
                <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                    {error}
                </p>
            ) : null}
            <div className="flex gap-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
                    Cancelar
                </Button>
                <Button type="submit" variant="primary" className="flex-1">
                    Guardar
                </Button>
            </div>
        </form>
    );
}
