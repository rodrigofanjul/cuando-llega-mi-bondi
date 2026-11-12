import { ImageResponse } from "next/og";
import { getLineas } from "@/lib/server/loadStaticDump";
import { lineaToSlug } from "@/lib/server/lineaSlug";
import { BRAND } from "@shared/brand";

export const alt = "Recorrido de colectivo en Mar del Plata";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function generateStaticParams() {
    const lineas = await getLineas();
    if (!lineas) return [{ linea: "__placeholder__" }];
    return lineas.map((l) => ({
        linea: lineaToSlug(l.Descripcion),
    }));
}

export default async function OpenGraphImage({
    params,
}: {
    params: Promise<{ linea: string }>;
}) {
    const { linea: slug } = await params;

    // Resolve slug to line name
    const lineas = await getLineas();
    const lineaInfo = lineas?.find(
        (l) => lineaToSlug(l.Descripcion) === slug
    );
    const nombre = lineaInfo?.Descripcion ?? slug.toUpperCase();

    return new ImageResponse(
        (
            <div
                style={{
                    height: "100%",
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: BRAND.backgroundDark,
                }}
            >
                {/* Line number badge */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: BRAND.accentColor,
                        borderRadius: 20,
                        padding: "24px 56px",
                        marginBottom: 32,
                    }}
                >
                    <span
                        style={{
                            fontSize: 96,
                            fontWeight: 900,
                            color: "#ffffff",
                            fontFamily: "ui-sans-serif, system-ui, sans-serif",
                            letterSpacing: -2,
                            lineHeight: 1,
                        }}
                    >
                        {nombre}
                    </span>
                </div>

                {/* Title */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 12,
                    }}
                >
                    <span
                        style={{
                            fontSize: 36,
                            fontWeight: 700,
                            color: "#f0f4f8",
                            fontFamily: "ui-sans-serif, system-ui, sans-serif",
                            letterSpacing: -0.5,
                        }}
                    >
                        Recorrido en Mar del Plata
                    </span>
                    <span style={{ fontSize: 40, fontWeight: 800, color: BRAND.accentColor, display: "flex" }}>
                        {BRAND.name}
                    </span>
                </div>
            </div>
        ),
        { ...size },
    );
}

