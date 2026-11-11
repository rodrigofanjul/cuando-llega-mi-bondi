/**
 * Arquitectura freemium PREPARADA, sin cobros (§16).
 *
 * - Con monetización apagada (default) todo está habilitado: nada se bloquea.
 * - Las funcionalidades que la app ya tenía son SIEMPRE gratuitas, aun con
 *   monetización encendida (no se quitan sin decisión explícita).
 * - Las compras dentro de las apps deben ir por App Store / Google Play
 *   (políticas de cada tienda): `PurchaseProvider` abstrae eso; hoy es no-op.
 */
export const FEATURES = [
    // Gratis siempre (existentes o básicas)
    "consultar_arribos",
    "favoritos",
    "recorridos",
    "planificador",
    "widget_basico",
    "alertas_basicas",
    "reportes",
    // Candidatas a premium (nuevas)
    "alertas_avanzadas",
    "widgets_personalizados",
    "automatizaciones",
    "estadisticas_historicas",
    "recomendaciones_avanzadas",
    "asistente_extendido",
] as const;
export type Feature = (typeof FEATURES)[number];

export const ALWAYS_FREE: ReadonlySet<Feature> = new Set<Feature>([
    "consultar_arribos",
    "favoritos",
    "recorridos",
    "planificador",
    "widget_basico",
    "alertas_basicas",
    "reportes",
]);

export type Plan = "free" | "premium";

export interface EntitlementState {
    monetizationEnabled: boolean;
    plan: Plan;
}

export const LIMITS: Record<Plan, { asistentePorDia: number; widgets: number; alertas: number }> = {
    free: { asistentePorDia: 10, widgets: 2, alertas: 3 },
    premium: { asistentePorDia: 100, widgets: 20, alertas: 15 },
};

export function hasFeature(state: EntitlementState, feature: Feature): boolean {
    if (!state.monetizationEnabled) return true;
    if (ALWAYS_FREE.has(feature)) return true;
    return state.plan === "premium";
}

/** Límites efectivos: sin monetización se usan los de premium (no se restringe a nadie). */
export function limitsFor(state: EntitlementState) {
    return LIMITS[state.monetizationEnabled ? state.plan : "premium"];
}

export function currentEntitlements(plan: Plan = "free"): EntitlementState {
    return { monetizationEnabled: process.env.NEXT_PUBLIC_MONETIZATION_ENABLED === "true", plan };
}

export interface Product {
    id: string;
    title: string;
    price: string;
    period: "month" | "year";
}

export type PurchaseResult = { ok: true; plan: Plan } | { ok: false; reason: "unavailable" | "cancelled" | "error" };

/** App Store (StoreKit) / Google Play Billing / web. Implementaciones nativas: pendientes (B4). */
export interface PurchaseProvider {
    readonly platform: "app_store" | "google_play" | "web" | "none";
    products(): Promise<Product[]>;
    purchase(productId: string): Promise<PurchaseResult>;
    restore(): Promise<PurchaseResult>;
}

export class NoopPurchaseProvider implements PurchaseProvider {
    readonly platform = "none" as const;
    async products(): Promise<Product[]> {
        return [];
    }
    async purchase(): Promise<PurchaseResult> {
        return { ok: false, reason: "unavailable" };
    }
    async restore(): Promise<PurchaseResult> {
        return { ok: false, reason: "unavailable" };
    }
}
