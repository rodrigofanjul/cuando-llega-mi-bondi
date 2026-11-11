# Bloqueos

| ID | Bloqueo | Afecta | Qué se hizo mientras tanto | Qué lo destraba |
| -- | ------- | ------ | -------------------------- | --------------- |
| B1 | Alcance documentado de la autorización de datos (uso comercial, recolección histórica, republicación) | §6.1 ingesta en producción, §14, §16 cobros, datos abiertos | El responsable confirma autorización de acceso (2026-11-11). Pipeline histórico implementado contra fixtures; ingesta deshabilitada por flag. | Documento escrito con alcance: retención, volumen, uso comercial. |
| B2 | Sin JDK/Android SDK ni macOS local | Compilar/instalar Android e iOS localmente | Proyectos y workflows de CI generados. | Push de la rama a GitHub (requiere aprobación) o instalar JDK 21 + Android SDK localmente. |
| B3 | Infraestructura push (FCM `google-services.json`, APNs key, VAPID privada) | Alertas exactas con app cerrada, Live Activities | Motor de alertas + ejecución local con app activa. | Credenciales en secretos de CI/servidor. |
| B4 | Cuentas de tiendas, certificados y firma | TestFlight, Play internal track | Configuración de firma por variables de entorno. | Apple Developer + Play Console + aprobación explícita de publicación. |
| B5 | Clave de proveedor LLM y presupuesto | Asistente conversacional real | Proveedor mock + herramientas tipadas. | Clave en secreto de servidor + tope de gasto. |
| B6 | Proyecto nativo actual de Play (`com.bondimdp.app`) fuera del repo | Reemplazar la app publicada sin romper actualizaciones | Capacitor usa `applicationId` configurable (default `com.bondimdp.app.dev`). | Acceso al proyecto/keystore actuales o decisión de nuevo id. |
| B7 | Tests de failover rotos en `main` (`shared/api/client.test.ts`) | CI verde | CI corre la suite completa sin excluir nada: el job de tests queda en rojo hasta resolverlo (no se esconde). Los tests nuevos corren además en un job propio. | Decisión del mantenedor (código de conexión, no se toca). |
| B8 | Licencias de assets de terceros (logos de prensa, sponsors, fuentes) | Empaquetado nativo | Modo `server.url`: no se empaquetan. | Revisión de licencias si se pasa a assets locales. |
| B9 | `shared/infra/supabase.ts` crea el cliente al importar y lanza sin `NEXT_PUBLIC_SUPABASE_URL` | Desarrollo local sin `.env`: el layout `(main)` no carga | Usar URL de marcador local en dev (ver docs/testing-results.md). No se modificó el módulo. | Decisión del mantenedor: crear el cliente de forma perezosa o documentar la variable como obligatoria. |
