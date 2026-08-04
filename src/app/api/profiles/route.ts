import { NextResponse } from "next/server";
import { getProfiles, createProfile } from "@/lib/profiles";
import { handleApiError, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getProfiles());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    return NextResponse.json(await createProfile(body), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
