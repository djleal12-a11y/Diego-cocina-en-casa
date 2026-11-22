DIEGO COCINA EN CASA — APLICACIÓN ANDROID (VERSIÓN 1.1)

Esta versión incluye:
- Inicio de sesión con Supabase Auth y validación del perfil/rol en public.profiles.
- Catálogo con fotografías, precios y disponibilidad.
- Inventario y registro de ventas.
- Abonos parciales y múltiples por venta.
- Fecha, valor y medio de pago de cada abono.
- Medios de pago: Efectivo, Transferencia con llaves, Nequi y Otros medios de pago.
- Cálculo automático de abonado y saldo pendiente.
- Cuentas por cobrar agrupadas por cliente.
- Reportes de ventas, recaudos del periodo, saldos y recaudo por medio de pago.
- Copia de seguridad y restauración incluyendo el historial de abonos.

ALMACENAMIENTO Y DATOS
- Productos, inventario, ventas y abonos se guardan localmente en este dispositivo mediante IndexedDB.
- Supabase se utiliza únicamente para iniciar sesión y validar el perfil del usuario.
- No existe sincronización de productos, ventas, inventario ni pagos entre dispositivos.
- La versión 1.1 conserva la misma base de datos local y adapta de forma automática las ventas antiguas.
- Las ventas antiguas marcadas como pagadas se migran como un pago completo con medio “No especificado”, porque la versión anterior no guardaba el medio de pago.
- No desinstales la aplicación ni borres sus datos si ya tienes información importante sin antes descargar una copia de seguridad.

Para compilar: ejecutar el workflow “Construir APK Android” y descargar el artefacto “Diego-Cocina-en-Casa-APK”.
Requiere Internet para iniciar sesión y validar el perfil en Supabase.
