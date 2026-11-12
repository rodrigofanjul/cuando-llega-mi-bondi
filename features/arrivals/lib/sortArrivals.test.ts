import { describe, expect, it } from "vitest";
import { sortArribosByEta } from "./sortArrivals";

const mk = (Arribo: string, id = Arribo) => ({ Arribo, id });
const etas = (l: { Arribo: string }[]) => l.map((a) => a.Arribo);

describe("sortArribosByEta", () => {
    it("pone arribando antes que minutos", () => {
        expect(etas(sortArribosByEta([mk("2 min"), mk("Arribando")]))).toEqual(["Arribando", "2 min"]);
    });
    it("ordena 11/3/8 como 3/8/11", () => {
        expect(etas(sortArribosByEta([mk("11 min"), mk("3 min"), mk("8 min")]))).toEqual(["3 min", "8 min", "11 min"]);
    });
    it("deja los desconocidos al final", () => {
        expect(etas(sortArribosByEta([mk("???"), mk("9 min"), mk("")]))).toEqual(["9 min", "???", ""]);
    });
    it("es estable en empates y no muta", () => {
        const input = [mk("5 min", "a"), mk("5 min", "b"), mk("1 min", "c")];
        const out = sortArribosByEta(input);
        expect(out.map((x) => x.id)).toEqual(["c", "a", "b"]);
        expect(input.map((x) => x.id)).toEqual(["a", "b", "c"]);
    });
});
