import { NextResponse } from "next/server";
import { updateModule, deleteModule } from "@/lib/checklist";
import { handleApiError, readJson } from "@/lib/api";

// En Next 15+/16 los params de rutas dinámicas son asíncronos (Promise).
type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Context) {
  try {
    const { id } = await params;
    const body = await readJson(req);
    return NextResponse.json(await updateModule(id, body));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: Request, { params }: Context) {
  try {
    const { id } = await params;
    return NextResponse.json(await deleteModule(id));
  } catch (error) {
    return handleApiError(error);
  }
}
