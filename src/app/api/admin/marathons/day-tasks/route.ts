import { NextResponse } from "next/server";
import { canManageMarathons } from "@/modules/marathons/daily/manageAccess";
import { dayTaskApiResponse } from "@/modules/marathons/daily/dayTaskApi";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const allowed = await canManageMarathons();
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const result = dayTaskApiResponse(allowed, body);
  return NextResponse.json(result.json, { status: result.status });
}
