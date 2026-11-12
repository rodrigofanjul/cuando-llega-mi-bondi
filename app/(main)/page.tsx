import type { Metadata } from "next";

import { HomeScreen } from "@features/home/components/HomeScreen";
import { BRAND } from "@shared/brand";

// Mismo opt-out que el resto de las rutas de (main) (ver layout).
export const instant = false;

export const metadata: Metadata = { title: { absolute: `${BRAND.name} — ${BRAND.description}` } };

export default function Page() {
    return <HomeScreen />;
}
