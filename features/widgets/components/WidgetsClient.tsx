"use client";

import Link from "next/link";
import { useId, useMemo, useState, useSyncExternalStore } from "react";

import { FavoritePicker } from "@features/favorites/components/FavoritePicker";
import { useFavoritos } from "@features/favorites/hooks/useFavoritos";
import type { Favorito } from "@features/favorites/types";
import { useSearchFlowData } from "@features/search/context/SearchFlowContext";
import type { WidgetConfig } from "@features/widgets/lib/config";
import {
    DAY_LABELS,
    PLACE_LABELS,
    configToDraft,
    draftToConfig,
    newDraft,
    newSlot,
    type SlotDraft,
    type WidgetDraft,
    type WidgetKind,
} from "@features/widgets/lib/draft";
import { getWidgetBridge, useWidgetConfigsStore } from "@features/widgets/store/useWidgetConfigsStore";
import { PageHeader } from "@shared/layout/PageHeader";
import { PageShell } from "@shared/layout/PageShell";
import { usePersistHydration } from "@shared/hooks/usePersistHydration";
import { Button, Card } from "@shared/ui";

const KIND_OPTIONS: { value: WidgetKind; label: string; hint: string }[] = [
    { value: "single", label: "Una línea", hint: "Próximo y siguiente arribo de un favorito." },
    { value: "multi", label: "Varias líneas", hint: "Los próximos colectivos de varios favoritos, en orden de llegada." },
    { value: "smart", label: "Inteligente", hint: "Muestra la parada que corresponde según el día y la hora." },
];

const noopSubscribe = () => () => {};

type DraftUpdate = (update: (d: WidgetDraft) => WidgetDraft) => void;

function newId(): string {
    return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function describeConfig(c: WidgetConfig): string {
    if (c.kind === "smart") return `${c.slots.length} franja${c.slots.length === 1 ? "" : "s"} horaria${c.slots.length === 1 ? "" : "s"}`;
    return c.targets.map((t) => `${t.lineLabel} · ${t.stopLabel}`).join(" — ");
}

export function WidgetsClient() {
    const { favoritos, isHydrated: favsReady } = useFavoritos();
    const { lineas } = useSearchFlowData();
    const configsReady = usePersistHydration(useWidgetConfigsStore);
    const configs = useWidgetConfigsStore((s) => s.configs);
    const syncError = useWidgetConfigsStore((s) => s.syncError);
    const upsert = useWidgetConfigsStore((s) => s.upsert);
    const remove = useWidgetConfigsStore((s) => s.remove);
    const [draft, setDraft] = useState<WidgetDraft | null>(null);
    const [error, setError] = useState<string | null>(null);
    const nativeAvailable = useSyncExternalStore(
        noopSubscribe,
        () => getWidgetBridge().available,
        () => false,
    );

    const descripcionToCode = useMemo(() => {
        const map = new Map<string, string>();
        for (const l of lineas) {
            const desc = (l.Descripcion ?? "").trim();
            if (desc) map.set(desc, l.CodigoLineaParada);
        }
        return map;
    }, [lineas]);

    const ready = favsReady && configsReady;

    const save = () => {
        if (!draft) return;
        const result = draftToConfig(draft, favoritos, descripcionToCode);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        upsert(result.config);
        setDraft(null);
        setError(null);
    };

    return (
        <PageShell>
            <PageHeader title="Mis" highlight="widgets" subtitle="Pantalla de inicio · Android y iOS" />

            <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
                {nativeAvailable
                    ? "Creá un widget acá y después agregalo desde la pantalla de inicio de tu teléfono."
                    : "Los widgets funcionan en la app de Android y iOS. Lo que configures acá se guarda en este dispositivo."}{" "}
                El sistema operativo decide cada cuánto se actualizan: siempre vas a ver la hora del último dato.
            </p>

            {syncError ? (
                <p role="alert" className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                    {syncError}
                </p>
            ) : null}

            {!ready ? (
                <div className="mt-6 flex flex-col gap-2.5" aria-busy="true" aria-label="Cargando widgets">
                    <div className="h-16 animate-pulse rounded-2xl bg-foreground/[0.06]" />
                    <div className="h-16 animate-pulse rounded-2xl bg-foreground/[0.06]" />
                </div>
            ) : draft ? (
                <WidgetEditor
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
            ) : (
                <section className="mt-6" aria-labelledby="widgets-list">
                    <h2 id="widgets-list" className="sr-only">
                        Widgets guardados
                    </h2>
                    {favoritos.length === 0 ? (
                        <Card className="p-4 text-[14px] text-muted-foreground">
                            Para crear un widget primero guardá una parada en{" "}
                            <Link href="/favoritos" className="font-semibold text-accent underline-offset-2 hover:underline">
                                Favoritos
                            </Link>
                            .
                        </Card>
                    ) : null}
                    <ul className="flex flex-col gap-2.5">
                        {configs.map((c) => (
                            <li key={c.id}>
                                <Card className="flex items-center gap-3 p-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[14px] font-semibold text-foreground">{c.name}</p>
                                        <p className="truncate text-[12px] text-muted-foreground">
                                            {KIND_OPTIONS.find((k) => k.value === c.kind)?.label} · {describeConfig(c)}
                                        </p>
                                    </div>
                                    <Button size="sm" variant="ghost" onClick={() => setDraft(configToDraft(c, favoritos, descripcionToCode))}>
                                        Editar
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        aria-label={`Eliminar widget ${c.name}`}
                                        onClick={() => {
                                            if (window.confirm(`¿Eliminar «${c.name}»?`)) remove(c.id);
                                        }}
                                    >
                                        Eliminar
                                    </Button>
                                </Card>
                            </li>
                        ))}
                    </ul>
                    {favoritos.length > 0 ? (
                        <Button className="mt-4 w-full" variant="primary" onClick={() => setDraft(newDraft(newId()))}>
                            Crear widget
                        </Button>
                    ) : null}
                </section>
            )}
        </PageShell>
    );
}

interface EditorProps {
    draft: WidgetDraft;
    favoritos: Favorito[];
    error: string | null;
    onChange: DraftUpdate;
    onCancel: () => void;
    onSave: () => void;
}

function WidgetEditor({ draft, favoritos, error, onChange, onCancel, onSave }: EditorProps) {
    const nameId = useId();
    const set = <K extends keyof WidgetDraft>(key: K, value: WidgetDraft[K]) => onChange((d) => ({ ...d, [key]: value }));

    return (
        <form
            className="mt-6 flex flex-col gap-5"
            onSubmit={(e) => {
                e.preventDefault();
                onSave();
            }}
            aria-label="Editor de widget"
        >
            <div className="flex flex-col gap-1.5">
                <label htmlFor={nameId} className="text-[13px] font-semibold text-foreground">
                    Nombre
                </label>
                <input
                    id={nameId}
                    value={draft.name}
                    maxLength={80}
                    placeholder="Ej.: Ir al trabajo"
                    onChange={(e) => set("name", e.target.value)}
                    className="min-h-11 rounded-xl border border-border bg-background px-3 text-[15px] text-foreground"
                />
            </div>

            <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-[13px] font-semibold text-foreground">Tipo</legend>
                {KIND_OPTIONS.map((k) => (
                    <label key={k.value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 has-[:checked]:border-accent">
                        <input
                            type="radio"
                            name="widget-kind"
                            value={k.value}
                            checked={draft.kind === k.value}
                            onChange={() => onChange((d) => ({ ...d, kind: k.value, favoriteIds: k.value === "single" ? d.favoriteIds.slice(0, 1) : d.favoriteIds }))}
                            className="mt-1"
                        />
                        <span>
                            <span className="block text-[14px] font-semibold text-foreground">{k.label}</span>
                            <span className="block text-[12px] text-muted-foreground">{k.hint}</span>
                        </span>
                    </label>
                ))}
            </fieldset>

            {draft.kind === "smart" ? (
                <SlotsEditor draft={draft} favoritos={favoritos} onChange={onChange} />
            ) : (
                <FavoritePicker
                    legend={draft.kind === "single" ? "Parada y línea" : "Paradas y líneas"}
                    favoritos={favoritos}
                    selected={draft.favoriteIds}
                    single={draft.kind === "single"}
                    onChange={(ids) => set("favoriteIds", ids)}
                />
            )}

            <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-[13px] font-semibold text-foreground">Visualización</legend>
                <label className="flex items-center gap-3 text-[14px] text-foreground">
                    <input type="checkbox" checked={draft.sameDirection} onChange={(e) => set("sameDirection", e.target.checked)} />
                    Sólo el sentido guardado en cada favorito
                </label>
                <label className="flex items-center gap-3 text-[14px] text-foreground">
                    <input type="checkbox" checked={draft.showSecondArrival} onChange={(e) => set("showSecondArrival", e.target.checked)} />
                    Mostrar también el siguiente colectivo
                </label>
                <label className="flex items-center gap-3 text-[14px] text-foreground">
                    Filas como máximo
                    <select
                        value={draft.maxRows}
                        onChange={(e) => set("maxRows", Number(e.target.value))}
                        className="min-h-10 rounded-lg border border-border bg-background px-2"
                    >
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                            <option key={n} value={n}>
                                {n}
                            </option>
                        ))}
                    </select>
                </label>
                <p className="text-[12px] text-muted-foreground">
                    Predicción: oficial. La corregida se habilitará cuando un modelo demuestre ser más preciso.
                </p>
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

function SlotsEditor({ draft, favoritos, onChange }: { draft: WidgetDraft; favoritos: Favorito[]; onChange: DraftUpdate }) {
    const updateSlot = (i: number, patch: Partial<SlotDraft> | ((s: SlotDraft) => Partial<SlotDraft>)) =>
        onChange((d) => ({ ...d, slots: d.slots.map((s, j) => (j === i ? { ...s, ...(typeof patch === "function" ? patch(s) : patch) } : s)) }));

    return (
        <div className="flex flex-col gap-3">
            <p className="text-[13px] font-semibold text-foreground">Franjas horarias (hora de Mar del Plata)</p>
            {draft.slots.map((slot, i) => (
                <Card key={i} className="flex flex-col gap-3 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="sr-only" htmlFor={`slot-place-${i}`}>
                            Lugar
                        </label>
                        <select
                            id={`slot-place-${i}`}
                            value={slot.place}
                            onChange={(e) => {
                                const place = e.target.value as SlotDraft["place"];
                                updateSlot(i, { place, label: PLACE_LABELS[place] });
                            }}
                            className="min-h-10 rounded-lg border border-border bg-background px-2 text-[14px]"
                        >
                            {Object.entries(PLACE_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </select>
                        <label className="flex items-center gap-1 text-[13px] text-foreground">
                            de
                            <input type="time" value={slot.from} onChange={(e) => updateSlot(i, { from: e.target.value })} className="min-h-10 rounded-lg border border-border bg-background px-2" />
                        </label>
                        <label className="flex items-center gap-1 text-[13px] text-foreground">
                            a
                            <input type="time" value={slot.to} onChange={(e) => updateSlot(i, { to: e.target.value })} className="min-h-10 rounded-lg border border-border bg-background px-2" />
                        </label>
                    </div>
                    <div role="group" aria-label={`Días de ${slot.label}`} className="flex flex-wrap gap-1.5">
                        {DAY_LABELS.map((d, day) => {
                            const on = slot.days.includes(day);
                            return (
                                <button
                                    key={d}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => updateSlot(i, (s) => ({ days: s.days.includes(day) ? s.days.filter((x) => x !== day) : [...s.days, day].sort((a, b) => a - b) }))}
                                    className={`min-h-9 min-w-11 rounded-lg px-2 text-[12px] font-semibold ${on ? "bg-accent text-white" : "bg-foreground/[0.07] text-foreground"}`}
                                >
                                    {d}
                                </button>
                            );
                        })}
                    </div>
                    <FavoritePicker
                        legend={`Paradas para ${slot.label}`}
                        favoritos={favoritos}
                        selected={slot.favoriteIds}
                        single={false}
                        onChange={(ids) => updateSlot(i, { favoriteIds: ids })}
                    />
                    <Button type="button" size="sm" variant="ghost" onClick={() => onChange((d) => ({ ...d, slots: d.slots.filter((_, j) => j !== i) }))}>
                        Quitar franja
                    </Button>
                </Card>
            ))}
            <Button
                type="button"
                variant="secondary"
                onClick={() => onChange((d) => ({ ...d, slots: [...d.slots, newSlot(d.slots.length === 0 ? "home" : "work")] }))}
            >
                Agregar franja
            </Button>
            <FavoritePicker
                legend="Fuera de las franjas (opcional)"
                favoritos={favoritos}
                selected={draft.fallbackFavoriteIds}
                single={false}
                onChange={(ids) => onChange((d) => ({ ...d, fallbackFavoriteIds: ids }))}
            />
        </div>
    );
}
