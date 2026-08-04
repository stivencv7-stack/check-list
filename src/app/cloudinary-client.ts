import { requestJson } from "./shared";

type SignResponse = {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
};

// Sube una imagen: pide firma al servidor y la manda DIRECTO a Cloudinary.
export async function uploadImage(file: File): Promise<{ url: string; publicId: string }> {
  const sign = await requestJson<SignResponse>("/api/cloudinary/sign", { method: "POST" });

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", sign.apiKey);
  form.append("timestamp", String(sign.timestamp));
  form.append("signature", sign.signature);
  form.append("folder", sign.folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || "No se pudo subir la imagen.");
  }
  return { url: data.secure_url as string, publicId: data.public_id as string };
}
