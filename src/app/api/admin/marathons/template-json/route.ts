import { NextResponse } from "next/server";
import { canManageMarathons } from "@/modules/marathons/daily/manageAccess";
import { marathonJsonTemplate } from "@/modules/marathons/daily/marathonJson";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await canManageMarathons())) return new NextResponse(null, { status: 401 });
  return new NextResponse(marathonJsonTemplate(), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="marathon-template.json"',
      "cache-control": "no-store",
    },
  });
}
