# Costos estimados (100 / 1.000 / 10.000 usuarios activos mensuales)

**Son estimaciones con supuestos explícitos**, no mediciones. Los precios de terceros marcados «verificar» cambian
seguido; confirmar en sus sitios antes de presupuestar. Precios de Claude: tabla oficial de modelos (nov. 2026).

## Supuestos de uso
| Supuesto | Valor |
| -------- | ----- |
| Sesiones de consulta por usuario activo / mes | 20 |
| Duración media con el panel abierto | 3 min → ~7 consultas de arribos (polling 25 s) |
| Widgets activos | 30 % de usuarios, 1 widget, 2 pares parada/línea |
| Refrescos de widget por día | ≤ 96 (cada 15 min, en la práctica menos por Doze); se asume 40 |
| Preguntas al asistente / usuario / mes | 10 (sólo si se activa Claude) |
| Tokens por pregunta (Claude Opus 5.5, esfuerzo low, ~2 rondas) | ~4.000 de entrada, ~300 de salida |

## Consultas de arribos al backend
`consultas/mes ≈ MAU × (20 × 7 + 0,3 × 2 × 40 × 30)` = MAU × 860.
Con caché compartida en el proxy/CDN (TTL corto), muchas consultas a la misma parada se sirven de caché: la carga real
sobre el proveedor de datos depende de la concentración por parada (medir con `X-Cache` / `/api/metrics`).

| MAU | Consultas de arribos/mes | Observaciones |
| --- | ------------------------ | ------------- |
| 100 | ~86.000 | Despreciable. |
| 1.000 | ~860.000 | Widgets ≈ 84 %: el intervalo mínimo de 90 s por par y la caché compartida son clave. |
| 10.000 | ~8,6 M | Revisar SLA/límites acordados con el proveedor de datos (B1). |

## Asistente (Claude)
Costo por pregunta ≈ 4.000 × $4/M + 300 × $20/M ≈ **$0,022** (Opus 5.5). Con caché de prompt en sistema+herramientas la
entrada baja; con Haiku 5.5 ($0,10/$0,50 por M) ≈ $0,0006 — decisión de calidad/costo a medir con evals.

| MAU | Preguntas/mes | Claude Opus 5.5 | Sin LLM (simulado) |
| --- | ------------- | --------------- | ------------------ |
| 100 | 1.000 | ~US$ 22 | US$ 0 |
| 1.000 | 10.000 | ~US$ 220 | US$ 0 |
| 10.000 | 100.000 | ~US$ 2.200 (tope diario configurable) | US$ 0 |

## Infraestructura
| Concepto | 100 | 1.000 | 10.000 | Notas |
| -------- | --- | ----- | ------ | ----- |
| Hosting Next (Render/Vercel) | plan actual | plan actual | escalar instancias | Verificar plan vigente. |
| Supabase (reportes, cuenta, históricos) | Free | Free/Pro | Pro | Históricos: ~860 obs./usuario/mes × muestreo 1/min ⇒ 10.000 MAU ≈ decenas de M filas/90 días; con retención de 1 año (D18) ≈ 4× eso: medir el volumen real en las primeras semanas y evaluar particionado mensual o agregación antes de llegar a ese tamaño. Verificar precios. |
| Push (FCM/APNs) | US$ 0 | US$ 0 | US$ 0 | Requiere servidor de envío (B3). |
| Mapas | ver B10 | ver B10 | ver B10 | Proveedor con licencia: costo por carga de mosaicos. Verificar. |
| Cuentas de tiendas | Apple US$ 99/año · Google US$ 25 único | | | Verificar. |

## Cómo medir
`/api/metrics` (con `METRICS_TOKEN`) da conteos y latencias por ruta y tokens del asistente por instancia. Reemplazar
los supuestos por mediciones antes de cualquier decisión de precio.
