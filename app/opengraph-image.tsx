import { ImageResponse } from "next/og";

import { BRAND } from "@shared/brand";

export const alt = "Cuándo Viene — Colectivos en Mar del Plata";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
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
                    color: "#f0f4f8",
                    gap: 20,
                }}
            >
                <div style={{ fontSize: 96, fontWeight: 800, display: "flex" }}>{BRAND.name}</div>
                <div style={{ fontSize: 32, color: BRAND.accentColor, display: "flex" }}>Colectivos en tiempo real · Mar del Plata</div>
            </div>
        ),
        { ...size },
    );
}
