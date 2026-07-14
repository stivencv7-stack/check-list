import { NextResponse } from "next/server";
import { createModule } from "@/lib/checklist";
import { handleApiError, readJson } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    return NextResponse.json(await createModule(body), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
