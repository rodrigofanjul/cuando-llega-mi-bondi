import { MetadataRoute } from "next";
import { BRAND } from "@shared/brand";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow: "/",
            },
            {
                userAgent: ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "anthropic-ai", "OAI-SearchBot", "ChatGPT-User", "Claude-SearchBot"],
                allow: "/",
            }
        ],
        sitemap: `${BRAND.appUrl}/sitemap.xml`,
    };
}
