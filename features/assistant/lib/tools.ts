/**
 * Herramientas del asistente (§11). Contrato tipado: el LLM interpreta la
 * intención y elige herramientas; NUNCA calcula arribos ni rutas por su cuenta.
 * Cada entrada se valida con zod antes de ejecutar (además de `strict: true`).
 */
import { z } from "zod";

const latLng = z.object({ lat: z.number().min(-39.5).max(-36), lng: z.number().min(-58.6).max(-56) }).strict();

export const TOOL_SCHEMAS = {
    buscar_parada: z
        .object({
            calle: z.string().trim().min(2).max(60),
            interseccion: z.string().trim().max(60).nullable(),
            linea: z.string().trim().max(10).nullable(),
        })
        .strict(),
    proximos_arribos: z.object({ stopId: z.string().trim().min(1).max(40), lineCode: z.string().trim().min(1).max(40) }).strict(),
    cuando_salir: z
        .object({
            stopId: z.string().trim().min(1).max(40),
            lineCode: z.string().trim().min(1).max(40),
            minutosCaminando: z.number().int().min(0).max(60),
        })
        .strict(),
    estado_servicio: z.object({ stopId: z.string().trim().min(1).max(40), lineCode: z.string().trim().min(1).max(40) }).strict(),
    buscar_lugar: z.object({ texto: z.string().trim().min(2).max(80) }).strict(),
    planificar_viaje: z.object({ origen: latLng, destino: latLng }).strict(),
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;
export type ToolInput<N extends ToolName> = z.infer<(typeof TOOL_SCHEMAS)[N]>;

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
    buscar_parada: "Busca paradas de Mar del Plata por calle e intersección (y opcionalmente línea). Devuelve stopId y líneas que pasan.",
    proximos_arribos: "Próximos arribos informados por el proveedor oficial para una parada y una línea. Única fuente válida de minutos de llegada.",
    cuando_salir: "Calcula cuándo salir hacia la parada según los arribos actuales, la caminata y un margen de seguridad.",
    estado_servicio: "Demoras estimadas y anomalías detectadas para una parada y línea, con su nivel de evidencia.",
    buscar_lugar: "Geocodifica un lugar o dirección de Mar del Plata. Devuelve coordenadas aproximadas.",
    planificar_viaje: "Planifica un viaje en colectivo entre dos coordenadas (caminata + colectivos). Devuelve opciones con duración estimada.",
};

/** JSON Schema para proveedores con tool calling (strict: todo requerido, sin propiedades extra). */
export function toolJsonSchemas(): { name: ToolName; description: string; input_schema: Record<string, unknown> }[] {
    const str = (maxLength: number) => ({ type: "string", maxLength });
    const nullableStr = (maxLength: number) => ({ type: ["string", "null"], maxLength });
    const coords = {
        type: "object",
        properties: { lat: { type: "number" }, lng: { type: "number" } },
        required: ["lat", "lng"],
        additionalProperties: false,
    };
    const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
    const schemas: Record<ToolName, Record<string, unknown>> = {
        buscar_parada: obj({ calle: str(60), interseccion: nullableStr(60), linea: nullableStr(10) }),
        proximos_arribos: obj({ stopId: str(40), lineCode: str(40) }),
        cuando_salir: obj({ stopId: str(40), lineCode: str(40), minutosCaminando: { type: "integer" } }),
        estado_servicio: obj({ stopId: str(40), lineCode: str(40) }),
        buscar_lugar: obj({ texto: str(80) }),
        planificar_viaje: obj({ origen: coords, destino: coords }),
    };
    return (Object.keys(TOOL_SCHEMAS) as ToolName[]).map((name) => ({ name, description: TOOL_DESCRIPTIONS[name], input_schema: schemas[name] }));
}

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };
export type ToolExecutors = { [N in ToolName]: (input: ToolInput<N>) => Promise<unknown> };

export interface ToolCallRecord {
    name: string;
    input: unknown;
    result: ToolResult;
}

/** Valida y ejecuta; nunca lanza (los errores vuelven como resultado para el modelo). */
export async function executeTool(executors: ToolExecutors, name: string, input: unknown): Promise<ToolResult> {
    if (!(name in TOOL_SCHEMAS)) return { ok: false, error: `herramienta desconocida: ${name}` };
    const tool = name as ToolName;
    const parsed = TOOL_SCHEMAS[tool].safeParse(input);
    if (!parsed.success) return { ok: false, error: `parámetros inválidos: ${parsed.error.issues[0]?.message ?? "formato"}` };
    try {
        const run = executors[tool] as (i: unknown) => Promise<unknown>;
        return { ok: true, data: await run(parsed.data) };
    } catch {
        return { ok: false, error: "la herramienta no respondió" };
    }
}
