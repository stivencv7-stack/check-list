# Vank Checklist — Next.js + Prisma + Supabase Realtime

Checklist colaborativo en **tiempo real**, reescrito desde el HTML/Express original con un stack moderno:

- **Next.js 16** (App Router) — frontend + API en un solo proyecto
- **Prisma 6** — ORM tipado + migraciones sobre **PostgreSQL**
- **Supabase** — PostgreSQL gestionado **+ Realtime** (sincronización en vivo)

Mantiene el mismo diseño (verde sobre negro) y las mismas funciones: módulos, tareas, edición en línea, porcentaje de avance por módulo y global.

---

## ¿Cómo funciona el tiempo real?

No hay servidor de sockets. El flujo es:

```
Navegador ──(POST/PATCH/DELETE)──> Route Handler (Next) ──Prisma──> PostgreSQL
                                                                        │
                                                                  (cambio en el WAL)
                                                                        │
Navegador <────────── WebSocket ────────── Supabase Realtime ◄──────────┘
```

1. Las **escrituras** van por la API de Next (Prisma) — nunca desde el cliente directo a la BD.
2. Cada cambio en Postgres lo detecta **Supabase Realtime** y lo emite por WebSocket.
3. El cliente, suscrito a las tablas `modules` y `tasks`, recibe el evento y refresca la lista.

> La app **también funciona sin Realtime**: cada mutación devuelve el checklist completo y actualiza la UI al instante. Realtime solo añade la sincronización **entre varias pestañas/usuarios**.

---

## Puesta en marcha

### 1. Crear el proyecto en Supabase

1. Entra a [supabase.com](https://supabase.com) → **New project** (guarda la contraseña de la BD).
2. **Project Settings → Database → Connection string** → pestaña **Prisma** (o "Connection pooling"):
   - **Transaction pooler** (puerto `6543`) → `DATABASE_URL`
   - **Direct connection** (puerto `5432`) → `DIRECT_URL`
3. **Project Settings → API**:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. Variables de entorno

```bash
cp .env.example .env
```

Rellena `.env` con los 4 valores del paso anterior.

### 3. Instalar y crear las tablas

```bash
npm install
npx prisma db push      # crea las tablas modules y tasks en Supabase
```

La app arranca **vacía**: creas tus módulos y tareas desde la interfaz.

### 4. Habilitar Realtime

En **Supabase Studio → SQL Editor**, ejecuta el contenido de
[`supabase/enable-realtime.sql`](supabase/enable-realtime.sql):

```sql
alter publication supabase_realtime add table public.modules;
alter publication supabase_realtime add table public.tasks;
```

(También puedes activarlo desde **Database → Replication** en el dashboard.)

### 5. Arrancar

```bash
npm run dev
```

Abre <http://localhost:3000>.

---

## Probar el tiempo real

Abre `http://localhost:3000` en **dos pestañas**. Crea, edita, marca o elimina algo en una: la otra se actualiza sola. El punto de estado en la tarjeta principal muestra:

- 🟢 **Conectado en tiempo real** — suscrito a Supabase Realtime
- 🔴 **Sin conexión / no configurado** — la app sigue funcionando, sin sync entre pestañas

---

## Scripts

| Script            | Qué hace                                             |
| ----------------- | ---------------------------------------------------- |
| `npm run dev`     | Servidor de desarrollo                               |
| `npm run build`   | `prisma generate` + build de producción              |
| `npm start`       | Sirve el build de producción                         |
| `npm run db:push` | Sincroniza el schema de Prisma con la BD             |
| `npm run db:studio` | Explorador visual de la BD (Prisma Studio)         |

---

## Estructura

```
prisma/
  schema.prisma          # modelos Module y Task
src/
  app/
    layout.tsx
    page.tsx             # renderiza el client component
    checklist-client.tsx # UI + estado + suscripción a Realtime
    globals.css          # diseño portado del HTML original
    api/                 # Route Handlers (CRUD)
      checklist/route.ts
      modules/route.ts
      modules/[id]/route.ts
      modules/[moduleId]/tasks/route.ts
      tasks/[id]/route.ts
  lib/
    prisma.ts            # singleton de PrismaClient
    checklist.ts         # capa de datos (lógica de negocio)
    supabase-browser.ts  # cliente de Supabase para Realtime (navegador)
    api.ts / errors.ts / types.ts
supabase/
  enable-realtime.sql
```

---

## Desplegar en Vercel

1. Sube el repo a GitHub → **Import** en Vercel.
2. Añade las **4 variables de entorno** en el proyecto de Vercel.
3. Deploy. La app en Vercel funciona en serverless porque el WebSocket de Realtime
   lo mantiene **el navegador contra Supabase**, no el servidor de Next.

> Con el pooler (`DATABASE_URL` en puerto 6543 + `?pgbouncer=true`) Prisma funciona
> correctamente en entornos serverless. `DIRECT_URL` (5432) se usa solo para migraciones.
