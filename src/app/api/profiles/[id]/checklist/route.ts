import { NextResponse } from "next/server";
import { getChecklist } from "@/lib/checklist";
import { handleApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Context) {
  try {
    const { id } = await params;
    return NextResponse.json(await getChecklist(id));
  } catch (error) {
    return handleApiError(error);
  }
}
