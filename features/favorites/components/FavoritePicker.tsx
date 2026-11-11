"use client";

import { useId } from "react";

import type { Favorito } from "@features/favorites/types";

export function favoriteLabel(f: Favorito): string {
    const line = f.lineaLabel || f.descripcionLinea;
    const where = [f.calleLabel, f.interseccionLabel].filter(Boolean).join(" y ");
    const bandera = f.descripcionBandera ? ` ${f.descripcionBandera}` : "";
    return `${f.nombre} · ${line}${bandera}${where ? ` · ${where}` : ""}`;
}

interface FavoritePickerProps {
    readonly legend: string;
    readonly favoritos: Favorito[];
    readonly selected: string[];
    readonly single: boolean;
    readonly onChange: (ids: string[]) => void;
}

/** Selector accesible de favoritos (radio o checkbox) para widgets y alertas. */
export function FavoritePicker({ legend, favoritos, selected, single, onChange }: FavoritePickerProps) {
    const group = useId();
    const toggle = (id: string, checked: boolean) => {
        if (single) onChange([id]);
        else onChange(checked ? selected.filter((x) => x !== id) : [...selected, id]);
    };
    return (
        <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-[13px] font-semibold text-foreground">{legend}</legend>
            {favoritos.map((f) => {
                const checked = selected.includes(f.id);
                return (
                    <label key={f.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-1 py-1.5 text-[14px] text-foreground">
                        <input
                            type={single ? "radio" : "checkbox"}
                            name={single ? group : undefined}
                            checked={checked}
                            onChange={() => toggle(f.id, checked)}
                        />
                        <span className="min-w-0 truncate">{favoriteLabel(f)}</span>
                    </label>
                );
            })}
        </fieldset>
    );
}
