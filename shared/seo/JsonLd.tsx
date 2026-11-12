import { BRAND } from "@shared/brand";

export function JsonLd() {
    const data = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: BRAND.name,
        url: BRAND.appUrl,
        description: BRAND.description,
        applicationCategory: "TravelApplication",
        inLanguage: "es-AR",
        offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "ARS",
        },
    };

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
        />
    );
}
