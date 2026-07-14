import { NextResponse } from "next/server";
import { HttpError } from "@/lib/errors";

// Lee el body JSON de una request sin explotar si viene vacío o malformado.
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const data = await req.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// Traduce cualquier error de la capa de datos a una respuesta JSON con status.
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json({ message: error.message }, { status: error.statusCode });
  }
  console.error(error);
  return NextResponse.json(
    { message: "Error interno del servidor." },
    { status: 500 }
  );
}
