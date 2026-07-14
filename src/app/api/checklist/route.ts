import { NextResponse } from "next/server";
import { getChecklist } from "@/lib/checklist";
import { handleApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getChecklist());
  } catch (error) {
    return handleApiError(error);
  }
}
