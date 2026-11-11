/**
 * Reportes colaborativos (§13) y ocupación experimental (§12). Lógica pura.
 *
 * Principios:
 * - Un reporte aislado NUNCA se presenta como hecho: se muestra agregado, con
 *   la leyenda «reportado por usuarios, no confirmado» y sólo desde 2 personas.
 * - Cada tipo caduca solo (TTL).
 * - Moderación: textos con enlaces, teléfonos, mails o insultos quedan pendientes.
 * - Reputación sólo con señales verificables (reportes corroborados por otras
 *   personas o por datos oficiales); acota el peso entre 0,5 y 1,5.
 * - Ocupación: sólo a partir de reportes; nunca se deduce de posiciones GPS.
 */
import { z } from "zod";

export const REPORT_TYPES = ["ocupacion", "demora", "desvio", "parada_fuera_de_servicio", "info_incorrecta"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const OCCUPANCY_LEVELS = ["baja", "media", "alta"] as const;
export type OccupancyLevel = (typeof OCCUPANCY_LEVELS)[number];

export const TTL_MIN: Record<ReportType, number> = {
    ocupacion: 30,
    demora: 45,
    desvio: 6 * 60,
    parada_fuera_de_servicio: 24 * 60,
    info_incorrecta: 7 * 24 * 60,
};

export const REPORT_LABEL: Record<ReportType, string> = {
    ocupacion: "Ocupación",
    demora: "Demora",
    desvio: "Desvío",
    parada_fuera_de_servicio: "Parada fuera de servicio",
    info_incorrecta: "Información incorrecta",
};

export const reportSubmissionSchema = z
    .object({
        type: z.enum(REPORT_TYPES),
        lineCode: z.string().trim().min(1).max(40),
        stopId: z.string().trim().max(40).nullable().default(null),
        occupancy: z.enum(OCCUPANCY_LEVELS).nullable().default(null),
        text: z.string().trim().max(200).nullable().default(null),
        /** Id aleatorio del dispositivo (el servidor guarda sólo su hash con sal). */
        deviceId: z.string().regex(/^[a-zA-Z0-9-]{16,64}$/),
    })
    .refine((r) => (r.type === "ocupacion") === (r.occupancy !== null), "La ocupación requiere nivel (y sólo ese tipo lo lleva)");
export type ReportSubmission = z.infer<typeof reportSubmissionSchema>;

/** Fila almacenada (sin datos personales). */
export interface StoredReport {
    id: string;
    type: ReportType;
    lineCode: string;
    stopId: string | null;
    occupancy: OccupancyLevel | null;
    text: string | null;
    reporterHash: string;
    createdAt: number;
    expiresAt: number;
    status: "approved" | "pending" | "rejected";
}

const LINK_RE = /(https?:\/\/|www\.|\.(com|ar|net|org)\b)/i;
const PHONE_RE = /(\+?\d[\d\s-]{7,}\d)/;
const MAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
// Lista corta y conservadora; un falso positivo sólo deja el texto pendiente de revisión.
const BLOCKLIST = ["boludo", "pelotudo", "forro", "puto", "mierda", "hdp", "concha"];

export function moderateText(text: string | null): { status: StoredReport["status"]; reason: string | null } {
    if (!text) return { status: "approved", reason: null };
    // El correo va antes que el enlace: «x@mail.com» también matchea el patrón de dominio.
    if (MAIL_RE.test(text)) return { status: "pending", reason: "correo" };
    if (LINK_RE.test(text)) return { status: "pending", reason: "enlace" };
    if (PHONE_RE.test(text)) return { status: "pending", reason: "teléfono" };
    const lower = text.toLowerCase();
    if (BLOCKLIST.some((w) => new RegExp(`\\b${w}\\b`, "i").test(lower))) return { status: "pending", reason: "lenguaje" };
    return { status: "approved", reason: null };
}

export function expiresAt(type: ReportType, createdAt: number): number {
    return createdAt + TTL_MIN[type] * 60_000;
}

/** Peso por reputación: corroborados / totales, con prior neutro (Beta(2,2)) y cota [0,5; 1,5]. */
export function reputationWeight(corroborated: number, total: number): number {
    const score = (corroborated + 2) / (total + 4); // 0..1, arranca en 0,5
    return Math.min(1.5, Math.max(0.5, 0.5 + score));
}

export interface ReportCluster {
    type: ReportType;
    lineCode: string;
    stopId: string | null;
    /** Personas distintas (no reportes): el mismo dispositivo cuenta una vez. */
    reporters: number;
    weight: number;
    firstAt: number;
    lastAt: number;
    /** Siempre falso: la comunidad no confirma, informa. */
    confirmed: false;
    label: string;
}

export const MIN_DISTINCT_REPORTERS = 2;

/**
 * Agrupa reportes vigentes y aprobados por (tipo, línea, parada). Descarta
 * grupos con menos de 2 personas distintas. `weights`: reputación por reporter.
 */
export function clusterReports(reports: StoredReport[], now: number, weights: Map<string, number> = new Map()): ReportCluster[] {
    const groups = new Map<string, StoredReport[]>();
    for (const r of reports) {
        if (r.status !== "approved" || r.expiresAt <= now || r.type === "ocupacion") continue;
        const key = `${r.type}|${r.lineCode}|${r.stopId ?? ""}`;
        groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const out: ReportCluster[] = [];
    for (const list of groups.values()) {
        const byReporter = new Map(list.map((r) => [r.reporterHash, r]));
        if (byReporter.size < MIN_DISTINCT_REPORTERS) continue;
        const first = list.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
        const last = list.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
        const minutesAgo = Math.max(0, Math.round((now - last.createdAt) / 60_000));
        out.push({
            type: first.type,
            lineCode: first.lineCode,
            stopId: first.stopId,
            reporters: byReporter.size,
            weight: [...byReporter.keys()].reduce((s, h) => s + (weights.get(h) ?? 1), 0),
            firstAt: first.createdAt,
            lastAt: last.createdAt,
            confirmed: false,
            label: `${REPORT_LABEL[first.type]} · reportado por ${byReporter.size} personas (último hace ${minutesAgo} min) · no confirmado`,
        });
    }
    return out.sort((a, b) => b.weight - a.weight || b.lastAt - a.lastAt);
}

export interface OccupancyEstimate {
    level: OccupancyLevel | "informacion_insuficiente";
    reporters: number;
    /** Texto de procedencia y calidad (transparencia). */
    provenance: string;
}

const LEVEL_VALUE: Record<OccupancyLevel, number> = { baja: 0, media: 1, alta: 2 };
const HALF_LIFE_MIN = 15;

/** Ocupación estimada por línea a partir de reportes recientes (decaimiento exponencial). */
export function estimateOccupancy(reports: StoredReport[], lineCode: string, now: number, weights: Map<string, number> = new Map()): OccupancyEstimate {
    const latestByReporter = new Map<string, StoredReport>();
    for (const r of reports) {
        if (r.type !== "ocupacion" || r.lineCode !== lineCode || r.status !== "approved" || r.expiresAt <= now || !r.occupancy) continue;
        const prev = latestByReporter.get(r.reporterHash);
        if (!prev || r.createdAt > prev.createdAt) latestByReporter.set(r.reporterHash, r);
    }
    const list = [...latestByReporter.values()];
    if (list.length < MIN_DISTINCT_REPORTERS) {
        return { level: "informacion_insuficiente", reporters: list.length, provenance: "Información insuficiente: se necesitan al menos 2 reportes recientes." };
    }
    let num = 0;
    let den = 0;
    for (const r of list) {
        const ageMin = (now - r.createdAt) / 60_000;
        const w = Math.pow(0.5, ageMin / HALF_LIFE_MIN) * (weights.get(r.reporterHash) ?? 1);
        num += w * LEVEL_VALUE[r.occupancy!];
        den += w;
    }
    const v = num / den;
    const level: OccupancyLevel = v < 0.67 ? "baja" : v < 1.34 ? "media" : "alta";
    return {
        level,
        reporters: list.length,
        provenance: `Estimada con ${list.length} reportes de usuarios de los últimos ${TTL_MIN.ocupacion} min. Experimental, no confirmada.`,
    };
}

/**
 * Señal verificable de reputación: un reporte se considera corroborado si otra
 * persona reportó lo mismo (tipo/línea/parada) dentro de su vigencia, o si es
 * una demora y el dato oficial informó desvío ≥ 5 min en ese lapso.
 */
export function isCorroborated(r: StoredReport, all: StoredReport[], officialDelayMinutes: number | null = null): boolean {
    if (r.type === "demora" && officialDelayMinutes !== null && officialDelayMinutes >= 5) return true;
    return all.some(
        (o) =>
            o.id !== r.id &&
            o.reporterHash !== r.reporterHash &&
            o.type === r.type &&
            o.lineCode === r.lineCode &&
            o.stopId === r.stopId &&
            Math.abs(o.createdAt - r.createdAt) <= TTL_MIN[r.type] * 60_000,
    );
}
