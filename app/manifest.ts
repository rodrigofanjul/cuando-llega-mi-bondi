import type { MetadataRoute } from "next";

import { BRAND } from "@shared/brand";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: BRAND.name,
        short_name: BRAND.shortName,
        description: BRAND.description,
        start_url: "/",
        display: "standalone",
        background_color: BRAND.backgroundLight,
        theme_color: BRAND.accentColor,
        lang: "es-AR",
        icons: [
            { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
            { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
        ],
    };
}
