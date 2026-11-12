import type { Metadata } from "next";
import { AcercaClient } from "@/app/acerca/AcercaClient";
import { BRAND } from "@shared/brand";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
    title: "Acerca de",
    description: BRAND.description,
    alternates: { canonical: "/acerca" },
};

export default function AcercaPage() {
    return <AcercaClient />;
}
