import { NextResponse } from "next/server";
import { canManageMarathons } from "@/modules/marathons/daily/manageAccess";
import { marathonWorkbookTemplate } from "@/modules/marathons/daily/marathonWorkbook";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await canManageMarathons())) return new NextResponse(null, { status: 401 });
  const bytes = await marathonWorkbookTemplate();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="marathon-template.xlsx"',
      "cache-control": "no-store",
    },
  });
}
