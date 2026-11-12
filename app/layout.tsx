import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { JsonLd } from "@shared/seo/JsonLd";
import { InstallPwaPrompt } from "@shared/layout/InstallPwaPrompt";
import { ThemeColorMeta } from "@shared/layout/ThemeColorMeta";
import { ThemeProvider } from "@shared/layout/ThemeProvider";
import { PwaViewportSync } from "@shared/layout/PwaViewportSync";
import { ToasterDeferred } from "@shared/ui/ToasterDeferred";
import Script from "next/script";
import { BRAND } from "@shared/brand";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

const inter = Inter({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-inter",
    weight: "variable",
});

export const metadata: Metadata = {
    metadataBase: new URL(BRAND.appUrl),
    title: { default: `${BRAND.name} — ${BRAND.description}`, template: `%s | ${BRAND.name}` },
    description: BRAND.description,
    alternates: { canonical: "/" },
    openGraph: { type: "website", locale: "es_AR", url: BRAND.appUrl, title: BRAND.name, description: BRAND.description, siteName: BRAND.name },
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: BRAND.shortName },
    icons: {
        icon: [
            { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
            { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
        ],
        apple: "/apple-icon.png",
        shortcut: "/favicon.ico",
    },
};

export const viewport: Viewport = {
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: BRAND.backgroundLight },
        { media: "(prefers-color-scheme: dark)", color: BRAND.backgroundDark },
    ],
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="es" suppressHydrationWarning>
            <head>
                <Script
                    id="sw-registration"
                    strategy="afterInteractive"
                    dangerouslySetInnerHTML={{
                        __html: `
                            if ('serviceWorker' in navigator && window.location.hostname !== 'localhost') {
                                window.addEventListener('load', function() {
                                    navigator.serviceWorker.register('/sw.js')
                                        .catch(function(err) { console.warn('SW registration failed:', err); });
                                });
                            }
                        `,
                    }}
                />
            </head>
            <body className={`${inter.variable}`}>
                <ThemeProvider>
                    <PwaViewportSync />
                    <ThemeColorMeta />
                    <JsonLd />
                    {children}
                    <ToasterDeferred />
                    <InstallPwaPrompt />
                </ThemeProvider>
            </body>
        </html>
    );
}
