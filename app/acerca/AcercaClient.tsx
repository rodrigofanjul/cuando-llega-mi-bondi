import Link from "next/link";

import { BRAND } from "@shared/brand";
import { BottomNav } from "@shared/layout/BottomNav";
import { Footer } from "@shared/layout/Footer";
import { PageShell } from "@shared/layout/PageShell";
import { BrandLogo } from "@shared/ui/BrandLogo";

const linkClass = "underline decoration-border underline-offset-2 transition-colors hover:text-foreground";

export function AcercaClient() {
    return (
        <div className="flex min-h-pwa-shell flex-col lg:pl-60">
            <PageShell className="space-y-8 pt-4">
                <section className="space-y-3 text-center">
                    <BrandLogo className="text-4xl lg:text-[40px]" />
                    <h1 className="text-[15px] font-semibold text-foreground">{BRAND.name}</h1>
                    <p className="text-[13px] text-muted-foreground">{BRAND.description}</p>
                </section>

                <section className="space-y-3 text-[13px] leading-relaxed text-muted-foreground">
                    <p>
                        Gratuita y sin publicidad. Usa los datos de arribos que publica la Municipalidad de
                        General Pueyrredon.
                    </p>
                    <p>{BRAND.originalProjectCredit}</p>
                    {BRAND.contactEmail ? (
                        <p>
                            Contacto:{" "}
                            <a href={`mailto:${BRAND.contactEmail}`} className={linkClass}>
                                {BRAND.contactEmail}
                            </a>
                        </p>
                    ) : null}
                    <p>
                        <Link href="/privacidad" className={linkClass}>
                            Privacidad
                        </Link>
                        {" · "}
                        <Link href="/terminos" className={linkClass}>
                            Términos
                        </Link>
                    </p>
                </section>

                <Footer />
            </PageShell>

            <BottomNav />
        </div>
    );
}
