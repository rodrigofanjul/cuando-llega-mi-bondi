"use client";

import { useId } from "react";

import type { TripPreference } from "@features/trip-planner/lib/preferences";

export interface TripOptionsValue {
    preference: TripPreference;
    when: "now" | "depart_at" | "arrive_by";
    /** `HH:MM` hora de Mar del Plata (para depart_at / arrive_by). */
    time: string;
}

export const DEFAULT_TRIP_OPTIONS: TripOptionsValue = { preference: "fastest", when: "now", time: "" };

const PREFERENCES: { value: TripPreference; label: string }[] = [
    { value: "fastest", label: "Más rápido" },
    { value: "least_walk", label: "Menos caminata" },
    { value: "fewest_transfers", label: "Menos transbordos" },
];

const WHEN: { value: TripOptionsValue["when"]; label: string }[] = [
    { value: "now", label: "Salir ahora" },
    { value: "depart_at", label: "Salir a las" },
    { value: "arrive_by", label: "Llegar antes de" },
];

const selectClass = "min-h-9 rounded-lg border border-border bg-background px-2 text-[13px] text-foreground";

interface Props {
    readonly value: TripOptionsValue;
    readonly onChange: (v: TripOptionsValue) => void;
}

/** Preferencia de ruta y horario. Re-ordena/filtra itinerarios sin volver a consultar. */
export function TripOptions({ value, onChange }: Props) {
    const prefId = useId();
    const whenId = useId();
    const timeId = useId();
    return (
        <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
            <label htmlFor={prefId} className="sr-only">
                Preferencia
            </label>
            <select id={prefId} className={selectClass} value={value.preference} onChange={(e) => onChange({ ...value, preference: e.target.value as TripPreference })}>
                {PREFERENCES.map((p) => (
                    <option key={p.value} value={p.value}>
                        {p.label}
                    </option>
                ))}
            </select>
            <label htmlFor={whenId} className="sr-only">
                Cuándo
            </label>
            <select id={whenId} className={selectClass} value={value.when} onChange={(e) => onChange({ ...value, when: e.target.value as TripOptionsValue["when"] })}>
                {WHEN.map((w) => (
                    <option key={w.value} value={w.value}>
                        {w.label}
                    </option>
                ))}
            </select>
            {value.when === "now" ? null : (
                <>
                    <label htmlFor={timeId} className="sr-only">
                        Hora
                    </label>
                    <input id={timeId} type="time" className={selectClass} value={value.time} onChange={(e) => onChange({ ...value, time: e.target.value })} />
                </>
            )}
        </div>
    );
}
