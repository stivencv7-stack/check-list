import { NextResponse } from "next/server";
import { createTask } from "@/lib/checklist";
import { handleApiError, readJson } from "@/lib/api";

// El slug se llama [id] (igual que el hermano modules/[id]) para no chocar en Next.
// Aquí ese id ES el moduleId.
type Context = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Context) {
  try {
    const { id: moduleId } = await params;
    const body = await readJson(req);
    return NextResponse.json(await createTask(moduleId, body), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
