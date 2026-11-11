# Revisión de seguridad (2026-11-11)

## Corregido en este ciclo
| Hallazgo | Severidad | Acción |
| -------- | --------- | ------ |
| Next.js 16.3.1 con advisories de RCE sin autenticación (Image Optimization SVG/AVIF, `use cache`, `next/og`), SSRF, cache poisoning | **Crítica** | Actualizado a **16.4.1** (+ `eslint-config-next`, `@next/third-parties`). `next build`, `tsc` y tests OK. |
| Sin borrado de datos locales | Media (requisito de tiendas) | Perfil → «Borrar datos de este dispositivo» (también vacía la config. de widgets nativos). |
| Manifiestos de privacidad iOS ausentes | Media (requisito Apple) | `PrivacyInfo.xcprivacy` en app y widget. |
| Permisos de ubicación faltantes en apps nativas | Funcional | `NSLocationWhenInUseUsageDescription` (iOS), `ACCESS_COARSE/FINE_LOCATION` (Android). |

## Pendiente (requiere decisión o cambio mayor)
| ID | Hallazgo | Severidad | Recomendación |
| -- | -------- | --------- | ------------- |
| S1 | `zod` 3 afectado por GHSA-mrhx-c7xc-m3w5 (agotamiento de memoria con colecciones grandes; arreglo en 4.6.6+, cambio mayor) | Alta | Migrar a zod 4. Mitigación actual en endpoints nuevos: arrays con `.max()`, límite de tamaño de body en `/api/observations` y rate limits. Agregar límite de body a todos los POST. |
| S2 | `mercadopago` → `uuid` < 11.1.1 (moderada; cambio mayor del SDK) | Moderada | Actualizar `mercadopago` a 3.x al tocar la compra de anuncios. |
| S3 | Mosaicos de mapa desde `mt1.google.com/vt` (endpoint interno de Google Maps, sin clave ni atribución) | **Legal / ToS** | Reemplazar por un proveedor con licencia comercial (o tiles propios); OSM público tampoco admite uso comercial intensivo. Ver B10. |
| S4 | Sin Content-Security-Policy (comentado en `next.config.ts`) | Media | Definir CSP con allowlist (AdSense, GA, Clarity, tiles, Supabase) en modo report-only primero. |
| S5 | Rate limits en memoria por instancia | Baja | Con varias instancias, mover a un almacén compartido (Redis/Upstash) si el abuso lo justifica. |
| S6 | `.github/workflows/probe-v670.yml` y `lib/server/mgpDirect.ts` contienen una clave pública RSA y un secreto compartido del cliente municipal, en un repo público | Decisión del responsable | Sin cambios (D1). Si se rota, moverlo a secretos. |
| S7 | Scripts de terceros (GA, Clarity, AdSense) dentro de la WebView de la app nativa | Tiendas | Ver B11. |

## Controles verificados en el código nuevo
- Validación con zod en todas las entradas de APIs nuevas; límites de longitud y de cantidad.
- Rate limits: observaciones (30/min IP), predicción (120/min), reportes (10/10 min IP + 5/10 min dispositivo), asistente (20/h IP + tope diario global).
- Sin datos personales en logs: sólo eventos y conteos (`logEvent`), nunca cuerpos ni IPs.
- Secretos sólo por variables de entorno; `/api/metrics` requiere token (comparación en tiempo constante) y no existe sin configurar.
- Supabase: tablas nuevas con RLS sin políticas públicas (acceso sólo por service role).
- Ubicación: sólo a pedido; al asistente redondeada a ~100 m; no se persiste.
- LLM: entradas y resultados de herramientas tratados como datos; fundamentación obligatoria de minutos.
