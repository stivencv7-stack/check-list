-- ===========================================================================
-- Habilitar Supabase Realtime para el checklist
-- ---------------------------------------------------------------------------
-- Ejecuta esto en Supabase Studio -> SQL Editor DESPUÉS de crear las tablas
-- con `npx prisma db push` (o `prisma migrate`).
--
-- Agrega las tablas a la publicación `supabase_realtime` para que los cambios
-- (INSERT / UPDATE / DELETE) se emitan por WebSocket a los clientes suscritos.
-- ===========================================================================

alter publication supabase_realtime add table public.modules;
alter publication supabase_realtime add table public.tasks;

-- NOTA sobre seguridad (RLS):
-- Las tablas creadas por Prisma tienen RLS deshabilitado. Con RLS OFF,
-- Realtime envía TODOS los cambios a TODOS los clientes con la anon key.
-- Es lo que queremos para este demo colaborativo (público).
-- Si más adelante habilitas RLS, necesitarás políticas de SELECT para que
-- Realtime siga entregando eventos a los clientes.
