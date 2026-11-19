import { NextResponse } from "next/server";
import { getCurrentUser, getSessionPayload, readLiveAccount } from "@/modules/auth/getCurrentUser";
import { hasPermission } from "@/modules/auth/permissions";
import { effectiveRole } from "@/modules/auth/viewRole";
import { marathonCsvTemplate } from "@/modules/marathons/daily/marathonCsv";

export const dynamic = "force-dynamic";

async function allowed(): Promise<boolean> {
  const cookieUser = await getCurrentUser();
  const account = cookieUser ? await readLiveAccount(cookieUser.id) : null;
  const payload = cookieUser ? await getSessionPayload() : null;
  const role = account ? effectiveRole(account.role, payload?.viewAs) : null;
  return Boolean(account && !account.isBanned && role && hasPermission(role, "marathon:manage"));
}

export async function GET() {
  if (!(await allowed())) return new NextResponse(null, { status: 401 });
  return new NextResponse(`\uFEFF${marathonCsvTemplate().replace(/^\uFEFF/, "")}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="marathon-template.csv"',
      "cache-control": "no-store",
    },
  });
}
