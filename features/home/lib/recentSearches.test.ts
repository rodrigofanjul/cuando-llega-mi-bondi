import { describe, expect, it } from "vitest";

import { pushRecent } from "./recentSearches";

describe("pushRecent", () => {
    it("deja las últimas 3, sin duplicados, la más nueva primero", () => {
        expect(pushRecent(["a", "b", "c"], "d")).toEqual(["d", "a", "b"]);
        expect(pushRecent(["a", "b"], "b")).toEqual(["b", "a"]);
        expect(pushRecent([], "  ")).toEqual([]);
    });
});
