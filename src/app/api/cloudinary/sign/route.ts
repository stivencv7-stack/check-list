import { NextResponse } from "next/server";
import { signUpload, isCloudinaryConfigured } from "@/lib/cloudinary";
import { handleApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

// Devuelve una firma para subir una imagen directo del navegador a Cloudinary.
export async function POST() {
  try {
    if (!isCloudinaryConfigured()) {
      return NextResponse.json(
        { message: "Cloudinary no está configurado en el servidor." },
        { status: 503 }
      );
    }
    return NextResponse.json(signUpload());
  } catch (error) {
    return handleApiError(error);
  }
}
