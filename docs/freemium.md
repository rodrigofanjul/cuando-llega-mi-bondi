# Freemium (preparado, sin cobros)

Implementación: `features/entitlements/lib/entitlements.ts`. **Apagado** (`NEXT_PUBLIC_MONETIZATION_ENABLED` sin definir):
todo habilitado, sin límites de plan gratuito.

| Siempre gratis (incluye todo lo que la app ya tenía) | Candidatas a premium (nuevas) |
| --------------------------------------------------- | ----------------------------- |
| Consultar arribos, favoritos, recorridos, planificador, widget básico, alertas básicas, reportes | Alertas avanzadas, widgets personalizados, automatizaciones recurrentes, estadísticas históricas, recomendaciones avanzadas, asistente con más consultas |

Límites de referencia (sólo con monetización activa): asistente 10/día gratis vs 100 premium; widgets 2 vs 20; alertas 3 vs 15.

## Antes de cobrar (no hecho, requiere decisión)
1. **Permiso comercial de los datos** (B1): sin él no se puede vender una función basada en datos del proveedor.
2. **Políticas de tiendas**: funciones digitales dentro de las apps se cobran con **In-App Purchase** (App Store) y
   **Google Play Billing**; no con enlaces de pago externos dentro de la app. `PurchaseProvider` abstrae StoreKit /
   Play Billing / web; hoy sólo existe `NoopPurchaseProvider` (no cobra nada).
3. Validación de recibos del lado del servidor y estado de suscripción por cuenta (requiere cuentas de tiendas, B4).
4. Política de reembolsos, precios por país y textos legales.
5. La venta de anuncios a comercios (MercadoPago, web) es preexistente y no es una compra digital dentro de la app.
