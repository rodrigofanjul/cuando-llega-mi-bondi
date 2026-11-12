import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prefersMarkdown } from "@shared/seo/acceptNegotiation";

const NOT_FOUND_MARKDOWN = "# 404\n\nLa ruta pedida no existe.\n";

/**
 * Rutas reales de la app (fuente: carpetas bajo app/**\/page.tsx). Se usa
 * solo para decidir si un path desconocido amerita el 404 con cuerpo
 * Markdown navegable (agentes que ya prefieren Markdown vía Accept); el
 * resto de las rutas conocidas sigue de largo sin tocar nada.
 */
const KNOWN_PATH_PATTERNS: RegExp[] = [
    /^\/$/,
    /^\/consultar$/,
    /^\/favoritos$/,
    /^\/acerca$/,
    /^\/como-llego$/,
    /^\/paradas-cerca$/,
    /^\/perfil$/,
    /^\/privacidad$/,
    /^\/recorrido(\/[^/]+)?$/,
    /^\/terminos$/,
    /^\/viajes$/,
    /^\/mas$/,
    /^\/opengraph-image$/,
];

export function proxy(request: NextRequest) {
    if (request.method !== "GET" && request.method !== "HEAD") {
        return NextResponse.next();
    }

    const accept = request.headers.get("accept");
    const { pathname } = request.nextUrl;

    // Path sin página real + agente que prefiere Markdown -> 404 navegable,
    // en vez del app shell HTML de siempre.
    if (prefersMarkdown(accept) && !KNOWN_PATH_PATTERNS.some((p) => p.test(pathname))) {
        return new NextResponse(NOT_FOUND_MARKDOWN, {
            status: 404,
            headers: { "Content-Type": "text/markdown; charset=utf-8", Vary: "Accept" },
        });
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!api|md|_next/static|_next/image|.*\\..*).*)"],
};
