import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Carpeta donde se guardan las imágenes en Cloudinary.
export const CLOUDINARY_FOLDER = "checklist";

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

export type UploadSignature = {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
};

// Genera una firma para que el navegador suba directo a Cloudinary.
// El secret nunca sale del servidor: solo se usa para firmar.
export function signUpload(): UploadSignature {
  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder: CLOUDINARY_FOLDER },
    process.env.CLOUDINARY_API_SECRET as string
  );
  return {
    timestamp,
    signature,
    apiKey: process.env.CLOUDINARY_API_KEY as string,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME as string,
    folder: CLOUDINARY_FOLDER,
  };
}

// Borra imágenes de Cloudinary. Best-effort: no lanza si falla (la BD manda).
export async function destroyImages(publicIds: string[]): Promise<void> {
  const ids = publicIds.filter(Boolean);
  if (!ids.length || !isCloudinaryConfigured()) return;
  try {
    await Promise.allSettled(ids.map((id) => cloudinary.uploader.destroy(id)));
  } catch (error) {
    console.error("Cloudinary destroy error:", error);
  }
}
