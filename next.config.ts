import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Next 16 bloquea por default requests cross-origin a assets/endpoints
   * dev-only (RSC payloads, HMR). Sin esto, compartir el dev server vía un
   * túnel (cloudflared) deja el front colgado en "Cargando..." porque el
   * fetch a /api/reference llega con un origin distinto de localhost y el
   * dev server lo descarta.
   */
  allowedDevOrigins: ["*.trycloudflare.com"],

  /**
   * Output standalone para self-hosting con Docker. Genera `.next/standalone/`
   * con un server.js minimalista + solo los node_modules necesarios.
   *
   * Desactivado en Vercel (`VERCEL` viene seteado por su entorno de build):
   * Vercel arma su propio bundle de funciones serverless y `standalone`
   * choca con ese tracing — produce un ENOENT sobre
   * `.next/next-server.js.nft.json` en el build.
   */
  output: process.env.VERCEL ? undefined : "standalone",

  /**
   * Habilita Cache Components (PPR + `'use cache'`). Requerido por
   * `lib/server/loadStaticDump.ts` que usa `'use cache' + cacheLife('max')`
   * + `cacheTag` en `getLineas()` y `getLineaData()`.
   */
  cacheComponents: true,

  /**
   * React Compiler: auto-memoiza componentes para reducir re-renders sin
   * tocar código. Especialmente útil acá donde HomeClient tiene 15+ piezas
   * de state y BusMap/RouteMap manejan muchos useMemo. Trade-off: builds
   * más lentos (Babel reintroducido).
   */
  reactCompiler: true,

  // `lib/server/loadStaticDump.ts` lee data/static/<files>.json con paths
  // computados en runtime (path.join(process.cwd(), "data", "static", ...)).
  // Como no son import estáticos, Next.js no los detecta como dependencia.
  // Esto le dice al tracer que los incluya en el bundle de /api/reference.
  outputFileTracingIncludes: {
    "/api/reference": ["./data/static/**/*.json"],
    "/api/search-index": ["./data/static/**/*.json"],
    "/recorrido/[linea]": ["./data/static/**/*.json"],
  },

  async headers() {
    return [
      {
        // CSP no incluida: el sitio carga tiles de mapa (OSM) y
        // Supabase — armar un allowlist completo es un cambio aparte, no algo
        // para colar en un pase de SEO.
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(self)" },
        ],
      },
    ];
  },

  /**
   * Compatibilidad: links viejos con ?tab=favoritos redirigen a /favoritos.
   * Alias en inglés (/about, /contact, /privacy) -> páginas reales en
   * español. Rutas de contenido retirado (blog, android, anunciantes, etc.)
   * redirigen al inicio.
   */
  async redirects() {
    return [
      {
        source: "/consultar",
        has: [{ type: "query", key: "tab", value: "favoritos" }],
        destination: "/favoritos",
        permanent: false,
      },
      { source: "/about", destination: "/acerca", permanent: true },
      { source: "/contacto", destination: "/acerca", permanent: true },
      { source: "/contact", destination: "/acerca", permanent: true },
      { source: "/privacy", destination: "/privacidad", permanent: true },
      { source: "/blog/:path*", destination: "/", permanent: true },
      { source: "/blog", destination: "/", permanent: true },
      { source: "/un-mes-en-numeros", destination: "/", permanent: true },
      { source: "/primer-trimestre-en-numeros", destination: "/", permanent: true },
      { source: "/android", destination: "/", permanent: true },
      { source: "/anunciate/:path*", destination: "/", permanent: true },
      { source: "/anunciate", destination: "/", permanent: true },
      { source: "/anunciantes", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
