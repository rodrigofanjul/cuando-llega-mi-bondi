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
    title: "Privacidad",
    description: `Cómo ${BRAND.name} trata tus datos: sin publicidad ni rastreadores de terceros.`,
    alternates: { canonical: "/privacidad" },
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

export default function PrivacidadPage() {
    return (
        <div className="flex min-h-pwa-shell flex-col lg:pl-60">
            <PageShell className="space-y-10 pt-4">
                <section className="space-y-3 text-center">
                    <BrandLogo className="text-3xl lg:text-4xl" />
                    <h1 className="text-[15px] font-semibold text-foreground">Política de privacidad</h1>
                    <p className="text-[12px] uppercase tracking-wider text-muted-foreground opacity-80">
                        Última actualización: {LAST_UPDATED}
                    </p>
                </section>

                <Section title="Resumen">
                    <p>
                        {BRAND.name} es una app gratuita para consultar el transporte público de {BRAND.city}.
                        No pedimos registro ni creamos cuentas, y no vendemos tus datos. No hay publicidad, ni
                        rastreadores de terceros, ni pagos dentro de la app.
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

                <Section title="Ubicación">
                    <Card>
                        <p>
                            Si usás funciones como «paradas cerca» o «cómo llego», tu navegador te pide permiso
                            y usamos tu ubicación solo para calcular paradas y recorridos cercanos. No la
                            guardamos ni la asociamos a vos.
                        </p>
                    </Card>
                </Section>

                <Section title="Datos en tu dispositivo">
                    <Card>
                        <p>
                            Tus favoritos, recientes y preferencias (como el tema claro u oscuro) se guardan
                            solo en tu dispositivo. Podés borrarlos cuando quieras desde{" "}
                            <strong>Perfil → Borrar datos</strong>.
                        </p>
                    </Card>
                </Section>

                <Section title="Observaciones anónimas">
                    <Card>
                        <p>
                            Si lo activás, la app puede enviar observaciones anónimas sobre cómo se mueven los
                            colectivos para mejorar las estimaciones. Esta opción viene desactivada y podés
                            apagarla en cualquier momento. No incluye datos que te identifiquen.
                        </p>
                    </Card>
                </Section>

                <Section title="Asistente">
                    <Card>
                        <p>
                            Cuando le hacés una pregunta al asistente, el mensaje se procesa para generar la
                            respuesta. No guardamos las conversaciones.
                        </p>
                    </Card>
                </Section>

                <Section title="Datos técnicos">
                    <p>
                        Como en cualquier sitio web, el servidor puede procesar datos técnicos (como la
                        dirección IP y el tipo de navegador) únicamente para que la app funcione.
                    </p>
                </Section>

                <Section title="Tus derechos">
                    <p>
                        Según la Ley N.º 25.326 de Protección de los Datos Personales de Argentina, tenés
                        derecho a acceder, rectificar y suprimir tus datos. Como casi todo queda en tu
                        dispositivo, la forma más rápida es borrarlo desde tu Perfil. Consultá también los{" "}
                        <Link href="/terminos" className={linkClass}>
                            términos de uso
                        </Link>
                        .
                    </p>
                </Section>

                <Section title="Cambios en esta política">
                    <p>Si la actualizamos, publicamos la versión vigente en esta página con su fecha.</p>
                </Section>

                <Footer />
            </PageShell>

            <BottomNav />
        </div>
    );
}
