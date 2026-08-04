import type { ChecklistImage, ChecklistLink } from "@/lib/types";

// Solo permite enlaces http/https (evita javascript:, data:, etc.).
// Si no trae esquema, asume https://.
function safeUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return null; // otro esquema -> rechazado
  return "https://" + url;
}

// Convierte el campo Json (imágenes) a un arreglo tipado y saneado (máx 2).
export function parseImages(value: unknown): ChecklistImage[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[])
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return { url: String(o.url ?? "").trim(), publicId: String(o.publicId ?? "").trim() };
    })
    .filter((im) => im.url && im.publicId)
    .slice(0, 2);
}

// Convierte el campo Json (enlaces) a un arreglo tipado y saneado (máx 2).
export function parseLinks(value: unknown): ChecklistLink[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[])
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const url = safeUrl(String(o.url ?? ""));
      if (!url) return null;
      const label = String(o.label ?? "").trim() || url;
      return { url, label };
    })
    .filter((l): l is ChecklistLink => l !== null)
    .slice(0, 2);
}
