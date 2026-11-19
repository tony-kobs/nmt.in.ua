import { NextResponse } from "next/server";
import { getCurrentUser, getSessionPayload, readLiveAccount } from "@/modules/auth/getCurrentUser";
import { hasPermission } from "@/modules/auth/permissions";
import { effectiveRole } from "@/modules/auth/viewRole";
import { exportMarathonCsv } from "@/modules/marathons/daily/marathonCsvStore";
import { getDailyById } from "@/modules/marathons/daily/store";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const cookieUser = await getCurrentUser();
  const account = cookieUser ? await readLiveAccount(cookieUser.id) : null;
  const payload = cookieUser ? await getSessionPayload() : null;
  const role = account ? effectiveRole(account.role, payload?.viewAs) : null;
  if (!account || account.isBanned || !role || !hasPermission(role, "marathon:manage")) {
    return new NextResponse(null, { status: 401 });
  }
  const { id } = await context.params;
  const marathonId = Number(id);
  if (!Number.isInteger(marathonId)) return new NextResponse(null, { status: 404 });
  const marathon = await getDailyById(marathonId);
  if (!marathon) return new NextResponse(null, { status: 404 });
  const csv = await exportMarathonCsv(marathon.id);
  if (!csv) return new NextResponse(null, { status: 404 });
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="marathon-${marathon.slug}-structure.csv"`,
      "cache-control": "no-store",
    },
  });
}
