import { NextResponse } from "next/server";
import { canManageMarathons } from "@/modules/marathons/daily/manageAccess";
import { loadMarathonDocument } from "@/modules/marathons/daily/marathonCsvStore";
import { documentToWorkbook } from "@/modules/marathons/daily/marathonWorkbook";
import { getDailyById } from "@/modules/marathons/daily/store";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await canManageMarathons())) return new NextResponse(null, { status: 401 });
  const { id } = await context.params;
  const marathonId = Number(id);
  if (!Number.isInteger(marathonId)) return new NextResponse(null, { status: 404 });
  const marathon = await getDailyById(marathonId);
  if (!marathon) return new NextResponse(null, { status: 404 });
  const document = await loadMarathonDocument(marathon.id);
  if (!document) return new NextResponse(null, { status: 404 });
  const bytes = await documentToWorkbook(document);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="marathon-${marathon.slug}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
