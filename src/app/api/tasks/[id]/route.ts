import { NextResponse } from "next/server";
import { updateTask, deleteTask } from "@/lib/checklist";
import { handleApiError, readJson } from "@/lib/api";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Context) {
  try {
    const { id } = await params;
    const body = await readJson(req);
    return NextResponse.json(await updateTask(id, body));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: Request, { params }: Context) {
  try {
    const { id } = await params;
    return NextResponse.json(await deleteTask(id));
  } catch (error) {
    return handleApiError(error);
  }
}
