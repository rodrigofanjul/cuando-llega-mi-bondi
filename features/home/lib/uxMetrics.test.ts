import { describe, expect, it } from "vitest";

import { sanitizeMissQuery, uxEventSchema } from "./uxMetrics";

describe("uxMetrics", () => {
    it("no registra direcciones con número de puerta", () => {
        expect(sanitizeMissQuery("luro 3456")).toBeNull();
        expect(sanitizeMissQuery("ab")).toBeNull();
        expect(sanitizeMissQuery("Avda Colón")).toBe("avenida colon");
    });

    it("valida eventos", () => {
        expect(uxEventSchema.safeParse({ type: "time_to_minutes", ms: 1200 }).success).toBe(true);
        expect(uxEventSchema.safeParse({ type: "search_miss", q: "x".repeat(81) }).success).toBe(false);
    });
});
