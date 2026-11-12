import { describe, expect, it } from "vitest";

import { displayCase, editDistanceAtMost1, normalizeText, tokens } from "./normalize";

describe("normalize", () => {
    it("minúsculas, sin tildes, abreviaturas", () => {
        expect(normalizeText("Avda. Pedro Luro")).toBe("avenida pedro luro");
        expect(normalizeText("Gral. Paz")).toBe("general paz");
        expect(normalizeText("CÓRDOBA")).toBe("cordoba");
        expect(normalizeText("12 de Octubre")).toBe("12 de octubre");
    });

    it("tokens sin palabras vacías", () => {
        expect(tokens("luro y salta")).toEqual(["luro", "salta"]);
        expect(tokens("esquina de luro con salta")).toEqual(["luro", "salta"]);
    });

    it("distancia de edición ≤ 1", () => {
        expect(editDistanceAtMost1("salta", "salta")).toBe(true);
        expect(editDistanceAtMost1("salta", "slta")).toBe(true);
        expect(editDistanceAtMost1("salta", "zalta")).toBe(true);
        expect(editDistanceAtMost1("salta", "saltaa")).toBe(true);
        expect(editDistanceAtMost1("salta", "sl")).toBe(false);
    });

    it("formato de nombres de calle", () => {
        expect(displayCase("12 DE OCTUBRE")).toBe("12 de Octubre");
        expect(displayCase("INDEPENDENCIA")).toBe("Independencia");
        expect(displayCase("JUAN B. JUSTO")).toBe("Juan B. Justo");
    });
});
