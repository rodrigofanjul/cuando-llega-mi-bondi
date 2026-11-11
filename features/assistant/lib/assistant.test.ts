import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";

import { AnthropicProvider, MAX_TOOL_ROUNDS } from "./anthropicProvider";
import { MockProvider } from "./mockProvider";
import { answer, isGrounded, minimizeContext, sanitizeMessage, type AssistantContext, type LlmProvider } from "./orchestrator";
import { executeTool, toolJsonSchemas, type ToolExecutors } from "./tools";

const ctx: AssistantContext = {
    favoritos: [
        { nombre: "Casa", stopId: "P1", stopLabel: "Luro y Salta", lineCode: "93", lineLabel: "531" },
        { nombre: "Trabajo", stopId: "P2", stopLabel: "Colón y Jujuy", lineCode: "98", lineLabel: "541" },
    ],
    origen: { lat: -37.998512, lng: -57.547534 },
};

function executors(overrides: Partial<ToolExecutors> = {}): ToolExecutors {
    return {
        buscar_parada: vi.fn(async () => ({ paradas: [] })),
        proximos_arribos: vi.fn(async ({ stopId }) => ({
            stopId,
            stopLabel: stopId === "P1" ? "Luro y Salta" : "Colón y Jujuy",
            lineLabel: stopId === "P1" ? "531" : "541",
            arribos: stopId === "P1" ? [{ minutos: 7, destino: "A CENTRO" }, { minutos: 15, destino: "A CENTRO" }] : [{ minutos: 3, destino: "A PUERTO" }],
        })),
        cuando_salir: vi.fn(async () => ({ recomendacion: "El colectivo llega en aproximadamente 7 min. Tardás 5 min caminando. Te recomendamos salir ahora." })),
        estado_servicio: vi.fn(async () => ({ senales: [{ nivel: "Demora estimada", mensaje: "Demora estimada de 6 min según el desvío horario informado." }] })),
        buscar_lugar: vi.fn(async () => ({ lugares: [{ label: "Playa Grande", lat: -38.0322, lng: -57.534 }] })),
        planificar_viaje: vi.fn(async () => ({ opciones: [{ lineas: ["531"], minutosTotales: 27, caminataMetros: 505 }] })),
        ...overrides,
    };
}

describe("controles del orquestador", () => {
    it("sanea y acota la entrada", () => {
        expect(sanitizeMessage("  hola\u0000\n  mundo ")).toBe("hola mundo");
        expect(sanitizeMessage("x".repeat(900))).toHaveLength(500);
    });

    it("minimiza datos: ubicación redondeada a ~100 m y máximo 10 favoritos", () => {
        const m = minimizeContext({ ...ctx, favoritos: Array(15).fill(ctx.favoritos[0]) });
        expect(m.origen).toEqual({ lat: -37.999, lng: -57.548 });
        expect(m.favoritos).toHaveLength(10);
    });

    it("fundamentación: minutos sólo si aparecen en resultados", () => {
        const calls = [{ name: "proximos_arribos", input: {}, result: { ok: true as const, data: { arribos: [{ minutos: 7 }] } } }];
        expect(isGrounded("Llega en 7 min.", calls)).toBe(true);
        expect(isGrounded("Llega en 4 min.", calls)).toBe(false);
        expect(isGrounded("No hay datos.", [])).toBe(true);
    });

    it("una respuesta con minutos inventados se reemplaza por datos", async () => {
        const liar: LlmProvider = {
            name: "fake",
            run: async ({ execute }) => {
                const result = await execute("proximos_arribos", { stopId: "P1", lineCode: "93" });
                return { text: "Llega en 2 min seguro.", calls: [{ name: "proximos_arribos", input: {}, result }], usage: null, refused: false };
            },
        };
        const r = await answer(liar, "cuando llega", ctx, executors());
        expect(r.grounded).toBe(false);
        expect(r.answer).toBe("Próximo: 7 min (A CENTRO). Siguiente: 15 min (A CENTRO).");
    });

    it("rechazo del modelo → mensaje de alcance, sin datos inventados", async () => {
        const refuser: LlmProvider = { name: "fake", run: async () => ({ text: "", calls: [], usage: null, refused: true }) };
        expect((await answer(refuser, "algo", ctx, executors())).answer).toMatch(/^No puedo ayudar con eso/);
    });

    it("las herramientas validan parámetros y no lanzan", async () => {
        expect(await executeTool(executors(), "proximos_arribos", { stopId: "", lineCode: "93" })).toMatchObject({ ok: false });
        expect(await executeTool(executors(), "borrar_todo", {})).toEqual({ ok: false, error: "herramienta desconocida: borrar_todo" });
        const failing = executors({ proximos_arribos: async () => Promise.reject(new Error("x")) });
        expect(await executeTool(failing, "proximos_arribos", { stopId: "P1", lineCode: "93" })).toEqual({ ok: false, error: "la herramienta no respondió" });
    });

    it("los esquemas JSON son estrictos", () => {
        for (const t of toolJsonSchemas()) {
            expect(t.input_schema.additionalProperties).toBe(false);
            expect(t.input_schema.required).toEqual(Object.keys(t.input_schema.properties as object));
        }
    });
});

describe("MockProvider (sin LLM)", () => {
    const ask = (q: string, c: AssistantContext = ctx, ex = executors()) => answer(new MockProvider(), q, c, ex);

    it("¿cuándo llega? con favorito", async () => {
        const r = await ask("¿Cuándo llega el 531 a Casa?");
        expect(r).toMatchObject({ provider: "mock", grounded: true, toolsUsed: ["proximos_arribos"] });
        expect(r.answer).toBe("El 531 llega a Luro y Salta en 7 min (A CENTRO). El siguiente, en 15 min.");
    });

    it("¿qué línea llega primero? compara favoritos", async () => {
        const r = await ask("¿Qué línea llega primero?");
        expect(r.answer).toBe("Llega primero el 541 en Colón y Jujuy: 3 min (A PUERTO).");
    });

    it("¿a qué hora salgo?", async () => {
        const ex = executors();
        const r = await ask("¿A qué hora tengo que salir para el 531 de Casa? camino 8 minutos a pie", ctx, ex);
        expect(ex.cuando_salir).toHaveBeenCalledWith({ stopId: "P1", lineCode: "93", minutosCaminando: 8 });
        expect(r.answer).toMatch(/salir ahora/);
    });

    it("¿hay demoras?", async () => {
        expect((await ask("¿Hay demoras en Casa?")).answer).toBe("Demora estimada: Demora estimada de 6 min según el desvío horario informado.");
    });

    it("¿cómo llego a…? usa ubicación compartida o la pide", async () => {
        const r = await ask("¿Cómo llego a Playa Grande?");
        expect(r.toolsUsed).toEqual(["buscar_lugar", "planificar_viaje"]);
        expect(r.answer).toBe("Para ir a Playa Grande, la mejor opción es en 531: unos 27 min en total, con 505 m a pie (estimado).");
        expect((await ask("¿Cómo llego a Playa Grande?", { ...ctx, origen: null })).answer).toMatch(/^¿Desde dónde salís\?/);
    });

    it("consulta ambigua o sin favoritos → ayuda, sin inventar", async () => {
        expect((await ask("hola")).answer).toMatch(/^Puedo decirte/);
        expect((await ask("¿cuándo llega?", { favoritos: [], origen: null })).answer).toMatch(/guardalas en Favoritos/);
    });
});

describe("AnthropicProvider (cliente falso, sin llamadas reales)", () => {
    type Created = Anthropic.Beta.BetaMessage;
    const msg = (content: unknown[], stop_reason: string): Created =>
        ({ content, stop_reason, usage: { input_tokens: 100, output_tokens: 20 } }) as unknown as Created;

    function fakeClient(responses: Created[]) {
        const create = vi.fn(async () => responses.shift()!);
        return { client: { beta: { messages: { create } } } as unknown as Anthropic, create };
    }

    it("loop de herramientas: reenvía el contenido completo y los resultados", async () => {
        const thinking = { type: "thinking", thinking: "", signature: "sig" };
        const { client, create } = fakeClient([
            msg([thinking, { type: "tool_use", id: "t1", name: "proximos_arribos", input: { stopId: "P1", lineCode: "93" } }], "tool_use"),
            msg([{ type: "text", text: "El 531 llega en 7 min." }], "end_turn"),
        ]);
        const r = await answer(new AnthropicProvider(client, "claude-opus-5-5"), "¿cuándo llega el 531 a casa?", ctx, executors());
        expect(r).toMatchObject({ provider: "anthropic", grounded: true, answer: "El 531 llega en 7 min.", usage: { inputTokens: 200, outputTokens: 40 } });
        const second = (create.mock.calls[1] as unknown as [Anthropic.Beta.MessageCreateParams])[0];
        expect(second.model).toBe("claude-opus-5-5");
        expect(second).toMatchObject({ fallbacks: "default", output_config: { effort: "low" }, betas: ["server-side-fallback-2026-07-01"] });
        expect(second.messages[1]).toEqual({ role: "assistant", content: [thinking, expect.objectContaining({ type: "tool_use" })] });
        expect(second.messages[2].content).toEqual([expect.objectContaining({ type: "tool_result", tool_use_id: "t1", is_error: false })]);
        expect((second.tools as { strict?: boolean }[]).every((t) => t.strict === true)).toBe(true);
    });

    it("parámetros inválidos del modelo vuelven como error de herramienta", async () => {
        const { client, create } = fakeClient([
            msg([{ type: "tool_use", id: "t1", name: "proximos_arribos", input: { stopId: "" } }], "tool_use"),
            msg([{ type: "text", text: "Necesito la parada." }], "end_turn"),
        ]);
        await answer(new AnthropicProvider(client), "x", ctx, executors());
        const second = (create.mock.calls[1] as unknown as [Anthropic.Beta.MessageCreateParams])[0];
        expect(second.messages[2].content).toEqual([expect.objectContaining({ is_error: true })]);
    });

    it("rechazo y tope de rondas", async () => {
        const refused = fakeClient([msg([], "refusal")]);
        expect((await answer(new AnthropicProvider(refused.client), "x", ctx, executors())).answer).toMatch(/^No puedo ayudar/);

        const loop = Array.from({ length: MAX_TOOL_ROUNDS + 1 }, (_, i) =>
            msg([{ type: "tool_use", id: `t${i}`, name: "proximos_arribos", input: { stopId: "P1", lineCode: "93" } }], "tool_use"),
        );
        const looping = fakeClient(loop);
        const r = await answer(new AnthropicProvider(looping.client), "x", ctx, executors());
        expect(looping.create).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS + 1);
        expect(r).toMatchObject({ grounded: false, answer: "Próximo: 7 min (A CENTRO). Siguiente: 15 min (A CENTRO)." });
    });
});
