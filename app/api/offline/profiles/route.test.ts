import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { checksumOf } from "@features/offline/lib/profiles";

const FIXTURE = fileURLToPath(new URL("../../../../features/offline/lib/__fixtures__/profiles-synthetic.json", import.meta.url));

async function freshRoute() {
    vi.resetModules();
    return import("./route");
}

const req = (qs: string, ip: string) => new NextRequest(`http://localhost/api/offline/profiles?${qs}`, { headers: { "x-forwarded-for": ip } });

describe("GET /api/offline/profiles", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("sin perfiles configurados → 404", async () => {
        const { GET } = await freshRoute();
        expect((await GET(req("pairs=A-S1|A", "1.0.0.1"))).status).toBe(404);
    });

    it("valida los pares", async () => {
        const { GET } = await freshRoute();
        expect((await GET(req("pairs=", "1.0.0.2"))).status).toBe(400);
        expect((await GET(req("pairs=sin-separador", "1.0.0.3"))).status).toBe(400);
    });

    it("sintético: sólo con flag fuera de producción, subconjunto con checksum válido", async () => {
        // El fixture tiene { profile, cases }: se sirve un archivo con sólo el perfil.
        const { readFile, writeFile, mkdtemp } = await import("node:fs/promises");
        const { tmpdir } = await import("node:os");
        const fixture = JSON.parse(await readFile(FIXTURE, "utf8"));
        const dir = await mkdtemp(`${tmpdir()}/bondi-`);
        const file = `${dir}/profiles.json`;
        await writeFile(file, JSON.stringify(fixture.profile));
        vi.stubEnv("OFFLINE_PROFILES_PATH", file);

        let { GET } = await freshRoute();
        expect((await GET(req("pairs=A-S1|A", "1.0.0.4"))).status).toBe(404);

        vi.stubEnv("OFFLINE_ALLOW_SYNTHETIC", "true");
        ({ GET } = await freshRoute());
        const body = await (await GET(req("pairs=A-S1|A,X|Y", "1.0.0.5"))).json();
        expect(Object.keys(body.entries)).toEqual(["A-S1|A"]);
        expect(await checksumOf(body.entries)).toBe(body.sha256);
    });
});
