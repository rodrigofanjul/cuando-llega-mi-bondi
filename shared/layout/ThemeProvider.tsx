"use client";

import { useEffect } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

import { useDisplayPrefs } from "@shared/display/useDisplayPrefs";

/** Refleja la preferencia de alto contraste en `<html data-contrast>`. */
function ContrastSync() {
    const highContrast = useDisplayPrefs((s) => s.highContrast);
    useEffect(() => {
        if (highContrast) document.documentElement.dataset.contrast = "high";
        else delete document.documentElement.dataset.contrast;
    }, [highContrast]);
    return null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    return (
        <NextThemesProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            storageKey="bondimdp-theme"
        >
            <ContrastSync />
            {children}
        </NextThemesProvider>
    );
}
