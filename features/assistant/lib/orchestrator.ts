/**
 * Orquestador del asistente: proveedor intercambiable + herramientas + controles.
 *
 * - Entrada acotada (500 caracteres, sin caracteres de control).
 * - Datos mínimos al modelo: favoritos (nombre/parada/línea) y, sólo si el
 *   usuario la compartió, ubicación redondeada a ~100 m.
 * - Fundamentación: todo «N min» de la respuesta debe aparecer en resultados de
 *   herramientas; si no, se descarta el texto y se responde con los datos.
 * - Presupuesto: rondas de herramientas acotadas por el proveedor; uso reportado.
 */
import { executeTool, type ToolCallRecord, type ToolExecutors, type ToolResult } from "./tools";

export interface FavoriteContext {
    nombre: string;
    stopId: string;
    stopLabel: string;
    lineCode: string;
    lineLabel: string;
}

export interface AssistantContext {
    favoritos: FavoriteContext[];
    /** Ubicación compartida explícitamente (se redondea antes de usarla). */
    origen: { lat: number; lng: number } | null;
}

export interface ProviderRun {
    text: string;
    calls: ToolCallRecord[];
    usage: { inputTokens: number; outputTokens: number } | null;
    refused: boolean;
}

export interface LlmProvider {
    readonly name: string;
    run(input: {
        message: string;
        context: AssistantContext;
        execute: (name: string, input: unknown) => Promise<ToolResult>;
    }): Promise<ProviderRun>;
}

export interface AssistantAnswer {
    answer: string;
    provider: string;
    toolsUsed: string[];
    grounded: boolean;
    usage: ProviderRun["usage"];
}

export const MAX_INPUT_CHARS = 500;

export function sanitizeMessage(raw: string): string {
    return raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_INPUT_CHARS);
}

export function minimizeContext(ctx: AssistantContext): AssistantContext {
    const round = (n: number) => Math.round(n * 1000) / 1000; // ~100 m
    return {
        favoritos: ctx.favoritos.slice(0, 10).map((f) => ({
            nombre: f.nombre.slice(0, 40),
            stopId: f.stopId,
            stopLabel: f.stopLabel.slice(0, 80),
            lineCode: f.lineCode,
            lineLabel: f.lineLabel.slice(0, 20),
        })),
        origen: ctx.origen ? { lat: round(ctx.origen.lat), lng: round(ctx.origen.lng) } : null,
    };
}

function collectNumbers(value: unknown, out: Set<number>) {
    if (typeof value === "number" && Number.isFinite(value)) out.add(value);
    // Textos generados por herramientas (p. ej. la recomendación de salida) también son datos.
    else if (typeof value === "string") for (const m of value.matchAll(/\d+/g)) out.add(Number(m[0]));
    else if (Array.isArray(value)) value.forEach((v) => collectNumbers(v, out));
    else if (value && typeof value === "object") Object.values(value).forEach((v) => collectNumbers(v, out));
}

/** ¿Todos los «N min» del texto salen de resultados de herramientas? */
export function isGrounded(text: string, calls: ToolCallRecord[]): boolean {
    const known = new Set<number>();
    for (const c of calls) {
        collectNumbers(c.input, known); // p. ej. minutos de caminata que dio el usuario
        if (c.result.ok) collectNumbers(c.result.data, known);
    }
    const mentioned = [...text.matchAll(/(\d+)\s*min/gi)].map((m) => Number(m[1]));
    return mentioned.every((n) => known.has(n));
}

/** Respuesta construida sólo con datos de herramientas (fallback seguro). */
export function renderFromData(calls: ToolCallRecord[]): string {
    const arr = [...calls].reverse().find((c) => c.name === "proximos_arribos" && c.result.ok);
    if (arr && arr.result.ok) {
        const d = arr.result.data as { lineLabel?: string; stopLabel?: string; arribos: { minutos: number | null; destino: string }[] };
        const next = d.arribos.filter((a) => a.minutos !== null).slice(0, 2);
        if (next.length === 0) return "No hay arribos informados en este momento para esa parada y línea.";
        return next.map((a, i) => `${i === 0 ? "Próximo" : "Siguiente"}: ${a.minutos} min${a.destino ? ` (${a.destino})` : ""}`).join(". ") + ".";
    }
    return "No pude responder con datos verificados. Probá preguntando por una parada y una línea concretas.";
}

export async function answer(provider: LlmProvider, rawMessage: string, ctx: AssistantContext, executors: ToolExecutors): Promise<AssistantAnswer> {
    const message = sanitizeMessage(rawMessage);
    if (!message) return { answer: "Escribí tu pregunta.", provider: provider.name, toolsUsed: [], grounded: true, usage: null };
    const run = await provider.run({
        message,
        context: minimizeContext(ctx),
        execute: (name, input) => executeTool(executors, name, input),
    });
    const toolsUsed = run.calls.map((c) => c.name);
    if (run.refused) {
        return { answer: "No puedo ayudar con eso. Puedo responder sobre colectivos, paradas y recorridos de Mar del Plata.", provider: provider.name, toolsUsed, grounded: true, usage: run.usage };
    }
    if (!run.text.trim() || !isGrounded(run.text, run.calls)) {
        return { answer: renderFromData(run.calls), provider: provider.name, toolsUsed, grounded: false, usage: run.usage };
    }
    return { answer: run.text, provider: provider.name, toolsUsed, grounded: true, usage: run.usage };
}
