import { NextResponse } from "next/server";
import { canManageMarathons } from "@/modules/marathons/daily/manageAccess";
import { documentToJson } from "@/modules/marathons/daily/marathonJson";
import { loadMarathonDocument } from "@/modules/marathons/daily/marathonCsvStore";
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
  return new NextResponse(documentToJson(document), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="marathon-${marathon.slug}.json"`,
      "cache-control": "no-store",
    },
  });
}
