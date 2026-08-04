import { NextResponse } from "next/server";
import { reorderTasks } from "@/lib/checklist";
import { handleApiError, readJson } from "@/lib/api";

type Context = { params: Promise<{ id: string }> };

// PATCH /api/modules/:id/reorder  body: { taskIds: string[] }
export async function PATCH(req: Request, { params }: Context) {
  try {
    const { id } = await params;
    const body = await readJson(req);
    return NextResponse.json(await reorderTasks(id, body.taskIds));
  } catch (error) {
    return handleApiError(error);
  }
}
