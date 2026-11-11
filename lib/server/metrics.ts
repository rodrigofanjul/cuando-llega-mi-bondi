/**
 * Métricas y logs estructurados livianos (§20), en memoria por instancia.
 * Sin datos personales: sólo nombre de ruta, estado, duración y contadores.
 * Para producción se pueden exportar a un backend (OpenTelemetry/Prometheus).
 */
const MAX_SAMPLES = 500;

interface RouteStats {
    count: number;
    byStatus: Record<string, number>;
    samples: number[];
}

const routes = new Map<string, RouteStats>();
const counters = new Map<string, number>();

export function recordRequest(route: string, status: number, ms: number): void {
    const s = routes.get(route) ?? { count: 0, byStatus: {}, samples: [] };
    s.count++;
    s.byStatus[status] = (s.byStatus[status] ?? 0) + 1;
    s.samples.push(ms);
    if (s.samples.length > MAX_SAMPLES) s.samples.shift();
    routes.set(route, s);
}

export function increment(name: string, by = 1): void {
    counters.set(name, (counters.get(name) ?? 0) + by);
}

function percentile(sorted: number[], p: number): number | null {
    if (sorted.length === 0) return null;
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

export function snapshot() {
    return {
        routes: Object.fromEntries(
            [...routes].map(([route, s]) => {
                const sorted = [...s.samples].sort((a, b) => a - b);
                const errors = Object.entries(s.byStatus).filter(([k]) => Number(k) >= 500).reduce((a, [, v]) => a + v, 0);
                return [route, { count: s.count, byStatus: s.byStatus, errorRate: s.count ? errors / s.count : 0, p50ms: percentile(sorted, 50), p95ms: percentile(sorted, 95) }];
            }),
        ),
        counters: Object.fromEntries(counters),
    };
}

export function resetMetrics(): void {
    routes.clear();
    counters.clear();
}

/** Log JSON de una línea; sólo campos explícitos (nunca cuerpos de request ni IPs). */
export function logEvent(event: string, fields: Record<string, string | number | boolean | null> = {}): void {
    console.info(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/** Envuelve un handler para medir latencia y estado. */
export function withMetrics<A extends unknown[]>(route: string, handler: (...args: A) => Promise<Response>) {
    return async (...args: A): Promise<Response> => {
        const start = performance.now();
        let status = 500;
        try {
            const res = await handler(...args);
            status = res.status;
            return res;
        } finally {
            recordRequest(route, status, Math.round(performance.now() - start));
        }
    };
}
