/**
 * Proveedor SIMULADO (sin LLM): interpreta intenciones frecuentes con reglas y
 * usa las mismas herramientas que un LLM. Sirve para desarrollo, tests y como
 * modo sin costo cuando no hay clave de API. Responde `provider: "mock"`.
 */
import type { AssistantContext, FavoriteContext, LlmProvider, ProviderRun } from "./orchestrator";
import type { ToolCallRecord, ToolResult } from "./tools";

function norm(s: string): string {
    return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
}

interface ArrivalsData {
    stopLabel: string;
    lineLabel: string;
    arribos: { minutos: number | null; destino: string }[];
}

const HELP =
    "Puedo decirte cuándo llega un colectivo, qué línea llega primero, cuándo salir, si hay demoras o cómo llegar a un lugar. " +
    "Por ejemplo: «¿Cuándo llega el 531 a Casa?» (usando un favorito) o «¿Cómo llego a Playa Grande?».";

function findFavorites(text: string, favs: FavoriteContext[]): FavoriteContext[] {
    const t = norm(text);
    const line = t.match(/\b(\d{3})\b/)?.[1];
    const byName = favs.filter((f) => t.includes(norm(f.nombre)));
    const pool = byName.length > 0 ? byName : favs;
    return line ? pool.filter((f) => norm(f.lineLabel).startsWith(line)) : byName;
}

export class MockProvider implements LlmProvider {
    readonly name = "mock";

    async run({ message, context, execute }: Parameters<LlmProvider["run"]>[0]): Promise<ProviderRun> {
        const calls: ToolCallRecord[] = [];
        const call = async (name: string, input: unknown): Promise<ToolResult> => {
            const result = await execute(name, input);
            calls.push({ name, input, result });
            return result;
        };
        const done = (text: string): ProviderRun => ({ text, calls, usage: null, refused: false });
        const t = norm(message);
        const asksWhichFirst = /primero|antes/.test(t) && /linea|colectivo|bondi|cual/.test(t);
        const named = findFavorites(message, context.favoritos);
        // «¿Qué línea llega primero?» sin nombrar paradas compara todos los favoritos.
        const targets = named.length === 0 && asksWhichFirst ? context.favoritos : named;

        // ¿Cómo llego a X?
        const dest = t.match(/como (?:llego|voy) (?:a|al|hasta) (.+?)[?.!]*$/)?.[1];
        if (dest) {
            if (!context.origen) return done("¿Desde dónde salís? Compartí tu ubicación para planificar el viaje.");
            const place = await call("buscar_lugar", { texto: dest });
            const first = place.ok ? (place.data as { lugares: { label: string; lat: number; lng: number }[] }).lugares[0] : undefined;
            if (!first) return done(`No encontré «${dest}». Probá con una dirección o un lugar más conocido.`);
            const plan = await call("planificar_viaje", { origen: context.origen, destino: { lat: first.lat, lng: first.lng } });
            if (!plan.ok) return done("No pude calcular el viaje en este momento.");
            const opciones = (plan.data as { opciones: { lineas: string[]; minutosTotales: number; caminataMetros: number }[] }).opciones;
            if (opciones.length === 0) return done(`No encontré una combinación de colectivos hasta ${first.label}.`);
            const o = opciones[0];
            const lineas = o.lineas.length ? `en ${o.lineas.join(" + ")}` : "caminando";
            return done(`Para ir a ${first.label}, la mejor opción es ${lineas}: unos ${o.minutosTotales} min en total, con ${o.caminataMetros} m a pie (estimado).`);
        }

        if (targets.length === 0) {
            return done(context.favoritos.length === 0 ? `Para responder necesito una parada y una línea: guardalas en Favoritos. ${HELP}` : HELP);
        }

        // ¿Hay demoras?
        if (/demora|atras|problema|anomal/.test(t)) {
            const f = targets[0];
            const r = await call("estado_servicio", { stopId: f.stopId, lineCode: f.lineCode });
            if (!r.ok) return done("No pude consultar el estado del servicio.");
            const s = r.data as { senales: { nivel: string; mensaje: string }[] };
            if (s.senales.length === 0) return done(`No detecto demoras ni anomalías para el ${f.lineLabel} en ${f.stopLabel} con los datos actuales.`);
            return done(s.senales.map((x) => `${x.nivel}: ${x.mensaje}`).join(" "));
        }

        // ¿A qué hora salgo?
        if (/salir|salgo/.test(t)) {
            const f = targets[0];
            const walk = Number(t.match(/(\d{1,2})\s*min(?:utos)?\s*(?:caminando|a pie)/)?.[1] ?? 5);
            const r = await call("cuando_salir", { stopId: f.stopId, lineCode: f.lineCode, minutosCaminando: walk });
            return done(r.ok ? (r.data as { recomendacion: string }).recomendacion : "No pude calcular cuándo salir.");
        }

        // ¿Qué línea llega primero? / ¿Cuándo llega?
        const results: { f: FavoriteContext; d: ArrivalsData }[] = [];
        for (const f of targets.slice(0, 4)) {
            const r = await call("proximos_arribos", { stopId: f.stopId, lineCode: f.lineCode });
            if (r.ok) results.push({ f, d: r.data as ArrivalsData });
        }
        const withEta = results
            .map(({ f, d }) => ({ f, next: d.arribos.find((a) => a.minutos !== null) }))
            .filter((x): x is { f: FavoriteContext; next: { minutos: number; destino: string } } => Boolean(x.next));
        if (withEta.length === 0) return done("No hay arribos informados en este momento para esas paradas.");
        withEta.sort((a, b) => a.next.minutos - b.next.minutos);
        const best = withEta[0];
        if (/primero|antes|cual/.test(t) && withEta.length > 1) {
            return done(`Llega primero el ${best.f.lineLabel} en ${best.f.stopLabel}: ${best.next.minutos} min${best.next.destino ? ` (${best.next.destino})` : ""}.`);
        }
        const d = results.find((r) => r.f === best.f)!.d;
        const timed = d.arribos.filter((a) => a.minutos !== null);
        const second = timed[1] ? ` El siguiente, en ${timed[1].minutos} min.` : "";
        return done(`El ${best.f.lineLabel} llega a ${best.f.stopLabel} en ${best.next.minutos} min${best.next.destino ? ` (${best.next.destino})` : ""}.${second}`);
    }
}

export type { AssistantContext };
