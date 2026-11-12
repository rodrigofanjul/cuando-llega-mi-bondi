import { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { getLineas } from "@/lib/server/loadStaticDump";
import { lineaToSlug } from "@/lib/server/lineaSlug";
import { BRAND } from "@shared/brand";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    "use cache";
    cacheLife("hours");

    const baseUrl = BRAND.appUrl;
    const now = new Date();

    const staticRoutes: MetadataRoute.Sitemap = [
        { url: baseUrl, lastModified: now, changeFrequency: "daily", priority: 1 },
        { url: `${baseUrl}/viajes`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
        { url: `${baseUrl}/mas`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
        { url: `${baseUrl}/recorrido`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
        { url: `${baseUrl}/acerca`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
        { url: `${baseUrl}/privacidad`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
        { url: `${baseUrl}/terminos`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    ];

    // Dynamic routes: one page per bus line
    const lineas = await getLineas();
    const lineaRoutes: MetadataRoute.Sitemap = (lineas ?? []).map((linea) => ({
        url: `${baseUrl}/recorrido/${lineaToSlug(linea.Descripcion)}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.7,
    }));

    return [...staticRoutes, ...lineaRoutes];
}
