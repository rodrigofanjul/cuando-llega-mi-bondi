"use client";

import type { SearchItem } from "@features/search/lib/quickSearch";

import { LineChip } from "./LineChip";

interface Props {
    readonly items: SearchItem[];
    readonly question: string | null;
    readonly loading: boolean;
    readonly onPick: (item: SearchItem) => void;
    readonly onAsk: (q: string) => void;
    readonly onByStreets: () => void;
}

const keepFocus = (e: React.MouseEvent) => e.preventDefault();

export function SearchResults({ items, question, loading, onPick, onAsk, onByStreets }: Props) {
    if (loading) return <p className="px-1 py-4 text-[14px] text-muted-foreground">Cargando paradas…</p>;
    return (
        <div>
            <p className="sr-only" aria-live="polite">{items.length === 0 ? "Sin resultados" : items.length === 1 ? "1 resultado" : `${items.length} resultados`}</p>
            <ul className="divide-y divide-border">
                {items.map((it) => (
                    <li key={it.key}>
                        <button type="button" onMouseDown={keepFocus} onClick={() => onPick(it)} className="flex min-h-[56px] w-full items-center gap-3 px-1 py-2 text-left">
                            {it.lineLabel ? <LineChip label={it.lineLabel} /> : <span className="w-[44px] text-center text-[18px]" aria-hidden="true">⌖</span>}
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[16px] font-semibold">{it.title}</span>
                                {it.subtitle ? <span className="block truncate text-[13px] text-muted-foreground">{it.subtitle}</span> : null}
                            </span>
                        </button>
                    </li>
                ))}
                {question ? (
                    <li>
                        <button type="button" onMouseDown={keepFocus} onClick={() => onAsk(question)} className="flex min-h-[56px] w-full items-center gap-3 px-1 py-2 text-left">
                            <span className="w-[44px] text-center text-[18px]" aria-hidden="true">✦</span>
                            <span className="text-[15px]">Preguntarle al asistente: «{question}»</span>
                        </button>
                    </li>
                ) : null}
            </ul>
            {items.length === 0 ? (
                <div className="px-1 py-4 text-[14px] text-muted-foreground">
                    No encontré esa línea o calle.{" "}
                    <button type="button" className="font-semibold text-accent underline" onMouseDown={keepFocus} onClick={onByStreets}>
                        Buscar por calles
                    </button>
                </div>
            ) : null}
        </div>
    );
}
