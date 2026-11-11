/**
 * Rate limiter en memoria (ventana deslizante simple por clave). Suficiente
 * para un único proceso; con varias instancias, cada una limita por separado
 * (documentado en docs/decisions.md). La clave nunca se persiste.
 */
export class RateLimiter {
    private hits = new Map<string, number[]>();

    constructor(
        private readonly limit: number,
        private readonly windowMs: number,
        private readonly maxKeys = 10_000,
    ) {}

    /** `true` si la request entra en el límite (y la cuenta). */
    take(key: string, now: number): boolean {
        const since = now - this.windowMs;
        const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
        if (recent.length >= this.limit) {
            this.hits.set(key, recent);
            return false;
        }
        recent.push(now);
        this.hits.set(key, recent);
        if (this.hits.size > this.maxKeys) this.evict(since);
        return true;
    }

    private evict(since: number) {
        for (const [k, times] of this.hits) {
            if (!times.some((t) => t > since)) this.hits.delete(k);
        }
        // Si aun así sigue lleno, descartar las claves más viejas.
        while (this.hits.size > this.maxKeys) {
            const oldest = this.hits.keys().next().value;
            if (oldest === undefined) break;
            this.hits.delete(oldest);
        }
    }
}

/** IP del cliente para limitar (no se guarda ni se loguea). */
export function clientKey(headers: Headers): string {
    const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    return fwd || headers.get("x-real-ip")?.trim() || "unknown";
}
