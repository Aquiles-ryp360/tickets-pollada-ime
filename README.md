# Tickets Pollada IME

Web independiente para registrar, buscar y actualizar tickets de pollada de Mecánica Eléctrica.

## Desarrollo local

```bash
cd ~/Proyectos/tickets-pollada-ime
npm install
npm run dev
```

Abre `http://localhost:3000`. Si no configuras Supabase, la app funciona en modo local usando `localStorage`.

Scripts útiles:

```bash
npm run typecheck
npm run build
npm run start
```

## Supabase

1. Crea un proyecto en Supabase.
2. Ejecuta el SQL de `supabase/schema.sql` en el SQL Editor.
3. Copia `.env.example` a `.env.local`.
4. Llena:

```bash
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
APP_ACCESS_PIN=un-pin-opcional
```

La `SERVICE_ROLE_KEY` solo se usa en endpoints de servidor. No se expone al navegador.

## Despliegue en Vercel

1. Importa esta carpeta como proyecto de Vercel.
2. Agrega las mismas variables de entorno en Vercel.
3. Deploy.

Variables opcionales:

```bash
PERUAPI_API_KEY=...
DNI_LOOKUP_ENABLED=true
UNAP_LOOKUP_ENABLED=true
UNAP_DEFAULT_CAREER_CODE=36
UNAP_DEFAULT_CAREER_NAME=INGENIERÍA MECÁNICA ELÉCTRICA
```

El autollenado por código UNA usa por defecto la carrera `36`, Ingeniería Mecánica Eléctrica.

## Datos

La tabla principal es `tickets` y guarda `ticket_number`, `dni`, `una_code`, `career_code`, `career_name`, `full_name`, `phone`, `seller`, `identity_source`, `paid`, `picked_up`, `observation`, `created_at` y `updated_at`.

No hay estado de anulado. Un ticket con `picked_up = true` y `paid = false` se muestra como caso observado y puede explicarse con `observation`.

## Flujo de consulta rápida

1. Busca primero tickets existentes en Supabase por ticket, DNI, código UNA, nombre, vendedor u observación.
2. Si no encuentra tickets y la búsqueda tiene 6 dígitos, consulta el servicio UNA Puno por código de matrícula.
3. Si no encuentra tickets y la búsqueda tiene 8 dígitos, consulta el proveedor DNI configurado.
4. Si se recuperan datos externos, muestra una ficha de cliente nuevo lista para agregar al formulario.
5. Si ya existe en Supabase, muestra una tabla compacta con pago, entrega y observación editable.
