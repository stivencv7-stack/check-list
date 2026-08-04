import { NextResponse } from "next/server";
import { getModulesIndex } from "@/lib/checklist";
import { handleApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

// Perfiles con sus módulos (solo nombres) para el menú "mover tarea".
export async function GET() {
  try {
    return NextResponse.json(await getModulesIndex());
  } catch (error) {
    return handleApiError(error);
  }
}
