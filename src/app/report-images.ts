export type ReportImage = { dataUrl: string; bytes: Uint8Array; w: number; h: number };

// Carga una imagen remota (Cloudinary permite CORS), la pasa por canvas a PNG,
// y devuelve tanto el dataUrl (para el PDF) como los bytes (para Word).
export async function loadReportImage(url: string): Promise<ReportImage | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    const base64 = dataUrl.split(",")[1] ?? "";
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { dataUrl, bytes, w: img.naturalWidth, h: img.naturalHeight };
  } catch {
    return null;
  }
}

// Precarga todas las imágenes de los módulos -> Map<publicId, ReportImage>.
export async function preloadImages(urls: { publicId: string; url: string }[]) {
  const cache = new Map<string, ReportImage>();
  await Promise.all(
    urls.map(async ({ publicId, url }) => {
      const info = await loadReportImage(url);
      if (info) cache.set(publicId, info);
    })
  );
  return cache;
}
