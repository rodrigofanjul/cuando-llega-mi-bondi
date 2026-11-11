/**
 * Hora local de Mar del Plata (America/Argentina/Buenos_Aires, UTC−3 sin
 * horario de verano). Se evalúa en esta zona —no la del dispositivo— porque el
 * servicio de colectivos es local (ver docs/decisions.md D6).
 */
const AR_OFFSET_MS = -3 * 60 * 60_000;

export interface LocalParts {
    /** 0 = domingo … 6 = sábado. */
    weekday: number;
    /** Minutos desde 00:00 local. */
    minuteOfDay: number;
    /** `YYYY-MM-DD` local. */
    date: string;
}

export function arLocalParts(epochMs: number): LocalParts {
    const d = new Date(epochMs + AR_OFFSET_MS);
    return {
        weekday: d.getUTCDay(),
        minuteOfDay: d.getUTCHours() * 60 + d.getUTCMinutes(),
        date: d.toISOString().slice(0, 10),
    };
}

/** `HH:MM` en hora de Mar del Plata. */
export function formatArClock(epochMs: number): string {
    const { minuteOfDay } = arLocalParts(epochMs);
    return `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`;
}

/** Epoch de `"HH:MM"` (hora local AR) en el mismo día local que `now`; `null` si es inválido. */
export function arTimeToday(now: number, hhmm: string): number | null {
    const target = parseHhMm(hhmm);
    if (target === null) return null;
    const { minuteOfDay } = arLocalParts(now);
    const startOfMinute = now - (now % 60_000);
    return startOfMinute + (target - minuteOfDay) * 60_000;
}

/** `"HH:MM"` → minutos desde medianoche; `null` si es inválido. */
export function parseHhMm(value: string): number | null {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * ¿`minute` cae en `[from, to)`? Soporta franjas que cruzan medianoche
 * (`22:00–02:00`). `from === to` se interpreta como "todo el día".
 */
export function inWindow(minute: number, from: number, to: number): boolean {
    if (from === to) return true;
    return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}

/** Duración en minutos de la franja `[from, to)`. */
export function windowLength(from: number, to: number): number {
    if (from === to) return 24 * 60;
    return from < to ? to - from : 24 * 60 - from + to;
}
