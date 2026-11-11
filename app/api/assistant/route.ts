import { NextRequest, NextResponse } from "next/server";

import { increment, logEvent, withMetrics } from "@/lib/server/metrics";
import { z } from "zod";

import { AnthropicProvider } from "@features/assistant/lib/anthropicProvider";
import { MockProvider } from "@features/assistant/lib/mockProvider";
import { MAX_INPUT_CHARS, answer, type LlmProvider } from "@features/assistant/lib/orchestrator";
import { createAssistantExecutors } from "@/lib/server/assistantExecutors";
import { RateLimiter, clientKey } from "@/lib/server/rateLimit";

/**
 * Asistente conversacional (§11). Proveedor intercambiable:
 * - con ANTHROPIC_API_KEY (y ASSISTANT_PROVIDER distinto de "mock") → Claude;
 * - si no → proveedor simulado basado en reglas (sin costo).
 * Límites: por IP (20/hora) y tope diario global (ASSISTANT_DAILY_LIMIT, default 500)
 * para controlar costos. No se guardan conversaciones.
 */
const perIp = new RateLimiter(20, 60 * 60_000);
let daily = { day: "", count: 0 };

const bodySchema = z.object({
    message: z.string().max(MAX_INPUT_CHARS * 2),
    context: z
        .object({
            favoritos: z
                .array(
                    z.object({
                        nombre: z.string().max(60),
                        stopId: z.string().max(40),
                        stopLabel: z.string().max(120),
                        lineCode: z.string().max(40),
                        lineLabel: z.string().max(40),
                    }),
                )
                .max(20)
                .default([]),
            origen: z.object({ lat: z.number().min(-39.5).max(-36), lng: z.number().min(-58.6).max(-56) }).nullable().default(null),
        })
        .default({ favoritos: [], origen: null }),
});

function pickProvider(): LlmProvider {
    const useClaude = process.env.ANTHROPIC_API_KEY?.trim() && process.env.ASSISTANT_PROVIDER !== "mock";
    return useClaude ? new AnthropicProvider() : new MockProvider();
}

function withinDailyBudget(now: number): boolean {
    const day = new Date(now).toISOString().slice(0, 10);
    if (daily.day !== day) daily = { day, count: 0 };
    const limit = Number(process.env.ASSISTANT_DAILY_LIMIT ?? 500);
    if (daily.count >= limit) return false;
    daily.count++;
    return true;
}

async function handlePOST(req: NextRequest) {
    const now = Date.now();
    if (!perIp.take(clientKey(req.headers), now)) {
        return NextResponse.json({ error: "rate_limited", answer: "Hiciste muchas preguntas seguidas. Probá en un rato." }, { status: 429 });
    }
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

    const provider = pickProvider();
    if (provider.name !== "mock" && !withinDailyBudget(now)) {
        return NextResponse.json({ error: "budget_exceeded", answer: "El asistente alcanzó el límite diario. Volvé a intentar mañana." }, { status: 429 });
    }
    try {
        const result = await answer(provider, parsed.data.message, parsed.data.context, createAssistantExecutors(req.nextUrl.origin));
        // Métrica de consumo sin contenido de la conversación.
        increment(`assistant.${provider.name}.queries`);
        if (!result.grounded) increment("assistant.ungrounded_replaced");
        if (result.usage) {
            increment(`assistant.${provider.name}.tokens_in`, result.usage.inputTokens);
            increment(`assistant.${provider.name}.tokens_out`, result.usage.outputTokens);
            logEvent("assistant.answer", { provider: provider.name, tokensIn: result.usage.inputTokens, tokensOut: result.usage.outputTokens, tools: result.toolsUsed.length });
        }
        return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch {
        console.error(`[assistant] ${provider.name} failed`);
        return NextResponse.json({ error: "assistant_unavailable", answer: "El asistente no está disponible ahora." }, { status: 503 });
    }
}

export const POST = withMetrics("/api/assistant POST", handlePOST);
