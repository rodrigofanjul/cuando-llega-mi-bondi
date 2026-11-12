"use client";

import { useState } from "react";

interface Props {
    readonly value: string;
    readonly onChange: (v: string) => void;
    readonly onFocusChange: (focused: boolean) => void;
    readonly onNear: () => void;
}

export function SearchBar({ value, onChange, onFocusChange, onNear }: Props) {
    const [numeric, setNumeric] = useState(true);
    return (
        <div className="flex items-center gap-2 rounded-[14px] border border-border bg-card px-3 py-2 shadow-sm">
            <span aria-hidden="true">🔍</span>
            <input
                type="search"
                inputMode={numeric ? "numeric" : "text"}
                enterKeyHint="search"
                aria-label="Buscar línea, calle o pregunta"
                placeholder="Línea, calle o pregunta"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => onFocusChange(true)}
                onBlur={() => onFocusChange(false)}
                className="min-h-[44px] flex-1 bg-transparent text-[16px] outline-none"
            />
            <button type="button" onClick={() => setNumeric((n) => !n)} className="min-h-[44px] min-w-[44px] rounded-[10px] text-[13px] font-semibold text-muted-foreground" aria-label={numeric ? "Teclado de letras" : "Teclado numérico"}>
                {numeric ? "abc" : "123"}
            </button>
            <button type="button" onClick={onNear} className="min-h-[44px] min-w-[44px] rounded-[10px] text-[18px]" aria-label="Paradas cerca mío">
                📍
            </button>
        </div>
    );
}
