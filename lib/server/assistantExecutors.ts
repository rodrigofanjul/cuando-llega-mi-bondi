/**
 * Ejecutores reales de las herramientas del asistente. Reutilizan piezas
 * existentes (sin fuentes nuevas):
 * - arribos: la misma ruta `/api/mgp` que usa la web;
 * - lugares: la ruta existente `/api/geo/nominatim` (con su User-Agent y caché);
 * - paradas y viajes: catálogo estático y planner RAPTOR del servidor.
 */
import type { Arribo } from "@features/arrivals/types";
import { normalizeArribo } from "@features/arrivals/lib/normalize";
import { detectAnomalies, LEVEL_LABEL } from "@features/anomalies/lib/detect";
import { describeRecommendation, recommend } from "@features/departure/lib/advisor";
import type { ToolExecutors } from "@features/assistant/lib/tools";
import { planMany } from "@features/trip-planner/lib/planner";
import { estimateMins } from "@features/trip-planner/lib/costModel";
import { getTransitStaticModels } from "@/lib/server/transitStaticModels";

function norm(s: string | null | undefined): string {
    return (s ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .trim();
}

export function createAssistantExecutors(origin: string): ToolExecutors {
    async function arrivals(stopId: string, lineCode: string) {
        const qs = new URLSearchParams({ identificadorParada: stopId, codigoLineaParada: lineCode });
        const res = await fetch(`${origin}/api/mgp/RecuperarProximosArribosW?${qs}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { arribos?: Arribo[] };
        const fetchedAt = Date.now();
        return {
            fetchedAt,
            stale: res.headers.get("X-Cache") === "STALE",
            normalized: (body.arribos ?? []).map((a) => normalizeArribo(a, { stopId, lineCode, fetchedAt })),
        };
    }

    return {
        async buscar_parada({ calle, interseccion, linea }) {
            const { paradas } = await getTransitStaticModels();
            const c = norm(calle);
            const i = norm(interseccion);
            const l = norm(linea);
            const matches = paradas.filter((p) => {
                const labels = `${norm(p.calleLabel)} ${norm(p.interseccionLabel)}`;
                if (!labels.includes(c)) return false;
                if (i && !labels.includes(i)) return false;
                if (l && !p.lineas.some((x) => norm(x.descripcion).startsWith(l) || x.codigoLineaParada === linea)) return false;
                return true;
            });
            return {
                paradas: matches.slice(0, 5).map((p) => ({
                    stopId: p.identificador,
                    label: [p.calleLabel, p.interseccionLabel].filter(Boolean).join(" y "),
                    lineas: p.lineas.slice(0, 12).map((x) => ({ lineCode: x.codigoLineaParada, label: x.descripcion })),
                })),
            };
        },

        async proximos_arribos({ stopId, lineCode }) {
            const a = await arrivals(stopId, lineCode);
            return {
                stopId,
                lineCode,
                actualizado: new Date(a.fetchedAt).toISOString(),
                datosViejos: a.stale,
                arribos: a.normalized.slice(0, 5).map((n) => ({ minutos: n.etaMinutes, estado: n.status, destino: n.destination })),
            };
        },

        async cuando_salir({ stopId, lineCode, minutosCaminando }) {
            const a = await arrivals(stopId, lineCode);
            if (a.stale) return { recomendacion: "Los datos de arribos están desactualizados; no puedo recomendar una hora de salida." };
            const buses = a.normalized
                .filter((n) => n.etaMinutes !== null)
                .map((n) => ({ etaMinutes: n.etaMinutes as number, vehicleId: n.vehicleId }));
            return { recomendacion: describeRecommendation(recommend(buses, minutosCaminando, a.fetchedAt), a.fetchedAt) };
        },

        async estado_servicio({ stopId, lineCode }) {
            const a = await arrivals(stopId, lineCode);
            const signals = detectAnomalies([{ at: a.fetchedAt, arrivals: a.normalized }]).filter((s) => s.level !== "datos_insuficientes");
            return { senales: signals.map((s) => ({ nivel: LEVEL_LABEL[s.level], mensaje: s.message })) };
        },

        async buscar_lugar({ texto }) {
            const res = await fetch(`${origin}/api/geo/nominatim?q=${encodeURIComponent(texto)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const body = (await res.json()) as { results?: { label: string; lat: number; lng: number }[] };
            const round = (n: number) => Math.round(n * 10_000) / 10_000;
            return { lugares: (body.results ?? []).slice(0, 3).map((r) => ({ label: r.label, lat: round(r.lat), lng: round(r.lng) })) };
        },

        async planificar_viaje({ origen, destino }) {
            const { graph } = await getTransitStaticModels();
            const its = planMany(graph, origen.lat, origen.lng, destino.lat, destino.lng, 2, 3);
            return {
                opciones: its.map((it) => ({
                    lineas: it.legs.flatMap((l) => (l.kind === "ride" ? [l.lineaLabel || l.codLinea] : [])),
                    minutosTotales: estimateMins(it.totalWalkMeters, it.totalRideMeters, it.totalRides),
                    caminataMetros: Math.round(it.totalWalkMeters),
                })),
            };
        },
    };
}
