"use client";

import { useId, useMemo, useState } from "react";

import type { Favorito } from "@features/favorites/types";
import { RETENTION_DAYS, suggest } from "@features/personalization/lib/habits";
import { useHabitsStore } from "@features/personalization/store/useHabitsStore";
import { usePersistHydration } from "@shared/hooks/usePersistHydration";
import { Button, Card } from "@shared/ui";

function currentTime() {
    return Date.now();
}

/** Sugerencia del favorito habitual para esta hora (sólo si el usuario lo activó). */
export function HabitSuggestion({ favoritos, onConsult }: { readonly favoritos: Favorito[]; readonly onConsult: (fav: Favorito) => void }) {
    const hydrated = usePersistHydration(useHabitsStore);
    const enabled = useHabitsStore((s) => s.enabled);
    const events = useHabitsStore((s) => s.events);
    const [now] = useState(currentTime);
    const suggestion = useMemo(
        () => (hydrated && enabled ? suggest(events, now, new Set(favoritos.map((f) => f.id))) : null),
        [hydrated, enabled, events, now, favoritos],
    );
    const fav = suggestion ? favoritos.find((f) => f.id === suggestion.favId) : undefined;
    if (!suggestion || !fav) return null;
    return (
        <Card className="mb-4 flex flex-col gap-2 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">Sugerencia para esta hora</p>
            <div className="flex items-center gap-3">
                <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">{fav.nombre}</p>
                <Button size="sm" variant="primary" onClick={() => onConsult(fav)}>
                    Consultar
                </Button>
            </div>
            <p className="text-[12px] text-muted-foreground">{suggestion.reason}</p>
        </Card>
    );
}

/** Consentimiento, explicación y borrado de la personalización. */
export function PersonalizationSettings() {
    const id = useId();
    const hydrated = usePersistHydration(useHabitsStore);
    const enabled = useHabitsStore((s) => s.enabled);
    const count = useHabitsStore((s) => s.events.length);
    const { setEnabled, clear } = useHabitsStore.getState();
    if (!hydrated) return null;
    return (
        <section aria-labelledby={id} className="mt-8 rounded-2xl border border-border p-4">
            <h2 id={id} className="text-[14px] font-semibold text-foreground">
                Sugerencias personalizadas
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Si las activás, guardamos <strong>sólo en este dispositivo</strong> qué favorito consultás y a qué hora (no tu
                ubicación) durante {RETENTION_DAYS} días, para sugerirte el habitual. No se envía a ningún servidor.
            </p>
            <label className="mt-3 flex items-center gap-3 text-[14px] text-foreground">
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                Activar sugerencias
            </label>
            {enabled ? (
                <div className="mt-2 flex items-center gap-3">
                    <p className="text-[12px] text-muted-foreground">{count} consultas guardadas.</p>
                    <Button size="sm" variant="ghost" onClick={clear} disabled={count === 0}>
                        Borrar historial
                    </Button>
                </div>
            ) : (
                <p className="mt-2 text-[12px] text-muted-foreground">Desactivar borra el historial guardado.</p>
            )}
        </section>
    );
}
