import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@shared/brand";
import { BottomNav } from "@shared/layout/BottomNav";
import { PageShell } from "@shared/layout/PageShell";
import { Footer } from "@shared/layout/Footer";
import { BrandLogo } from "@shared/ui/BrandLogo";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
    title: "Términos",
    description: `Condiciones de uso de ${BRAND.name}.`,
    alternates: { canonical: "/terminos" },
    robots: { index: true, follow: true },
};

const LAST_UPDATED = "12 de noviembre de 2026";

const linkClass = "underline decoration-border underline-offset-2 hover:text-foreground";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <h2 className="text-[10.4px] font-normal uppercase tracking-wider text-muted-foreground">
                {title}
            </h2>
            <div className="space-y-3 text-[13px] leading-relaxed text-muted-foreground">
                {children}
            </div>
        </section>
    );
}

function Card({ children }: { children: React.ReactNode }) {
    return <div className="space-y-2 rounded-xl border border-border bg-card p-4">{children}</div>;
}

export default function TerminosPage() {
    return (
        <div className="flex min-h-pwa-shell flex-col lg:pl-60">
            <PageShell className="space-y-10 pt-4">
                <section className="space-y-3 text-center">
                    <BrandLogo className="text-3xl lg:text-4xl" />
                    <h1 className="text-[15px] font-semibold text-foreground">Términos de uso</h1>
                    <p className="text-[12px] uppercase tracking-wider text-muted-foreground opacity-80">
                        Última actualización: {LAST_UPDATED}
                    </p>
                </section>

                <Section title="El servicio">
                    <p>
                        {BRAND.name} es un servicio gratuito, ofrecido «tal cual», sin garantías de ningún tipo
                        (ni de exactitud, ni de disponibilidad, ni de aptitud para un fin particular). Podemos
                        modificarlo o suspenderlo en cualquier momento.
                    </p>
                    {BRAND.contactEmail ? (
                        <p>
                            Ante cualquier consulta, escribinos a{" "}
                            <a href={`mailto:${BRAND.contactEmail}`} className={linkClass}>
                                {BRAND.contactEmail}
                            </a>
                            .
                        </p>
                    ) : null}

                </Section>

                <Section title="Horarios y estimaciones">
                    <Card>
                        <p>
                            Los tiempos de arribo vienen del proveedor municipal y pueden ser incorrectos o no
                            estar disponibles. Las estimaciones históricas son aproximadas y se muestran como
                            tales. No nos hacemos responsables por colectivos que pasen antes o después de lo
                            indicado.
                        </p>
                    </Card>
                </Section>

                <Section title="Uso responsable">
                    <p>No uses la app mientras manejás. Mirá el celular solo cuando sea seguro.</p>
                </Section>

                <Section title="Reportes de la comunidad">
                    <p>
                        Los reportes y comentarios tienen que ser respetuosos. Podemos moderarlos o eliminarlos
                        si no lo son.
                    </p>
                </Section>

                <Section title="Licencia">
                    <p>{BRAND.originalProjectCredit}</p>
                    <p>
                        Mirá también la{" "}
                        <Link href="/privacidad" className={linkClass}>
                            política de privacidad
                        </Link>
                        .
                    </p>
                </Section>

                <Footer />
            </PageShell>

            <BottomNav />
        </div>
    );
}
