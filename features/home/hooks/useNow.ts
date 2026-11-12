"use client";

import { useEffect, useState } from "react";

/** Reloj para cuentas regresivas (React Compiler: nada de Date.now() en render). */
export function useNow(intervalMs = 15_000): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}
