import { describe, expect, it } from "vitest";

import { RateLimiter, clientKey } from "./rateLimit";

describe("RateLimiter", () => {
    it("permite hasta el límite dentro de la ventana y libera después", () => {
        const rl = new RateLimiter(2, 1000);
        expect(rl.take("a", 0)).toBe(true);
        expect(rl.take("a", 100)).toBe(true);
        expect(rl.take("a", 200)).toBe(false);
        expect(rl.take("b", 200)).toBe(true);
        expect(rl.take("a", 1101)).toBe(true);
    });

    it("acota la cantidad de claves en memoria", () => {
        const rl = new RateLimiter(1, 1000, 3);
        for (let i = 0; i < 10; i++) rl.take(`k${i}`, i);
        expect((rl as unknown as { hits: Map<string, number[]> }).hits.size).toBeLessThanOrEqual(3);
    });
});

describe("clientKey", () => {
    it("usa el primer x-forwarded-for", () => {
        expect(clientKey(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
        expect(clientKey(new Headers())).toBe("unknown");
    });
});
