import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente de Supabase para el NAVEGADOR: solo se usa para suscribirse a Realtime.
// Las escrituras NO pasan por aquí, van por los Route Handlers (Prisma).
let client: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Si no están las variables, la app sigue funcionando sin sincronización en vivo.
  if (!url || !anonKey) return null;

  if (!client) {
    client = createClient(url, anonKey, {
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return client;
}
