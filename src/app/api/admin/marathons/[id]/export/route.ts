import { NextResponse } from "next/server";
import { getCurrentUser, readLiveAccount } from "@/modules/auth/getCurrentUser";
import { hasPermission } from "@/modules/auth/permissions";
import { getDailyById, listParticipantReports } from "@/modules/marathons/daily/store";
import { parseUtmSource, toCsv } from "@/modules/marathons/daily/utm";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const cookieUser = await getCurrentUser();
  const account = cookieUser ? await readLiveAccount(cookieUser.id) : null;
  if (!account || account.isBanned || !hasPermission(account.role, "marathon:manage")) {
    return new NextResponse(null, { status: 401 });
  }
  const { id } = await context.params;
  const marathon = await getDailyById(Number(id));
  if (!marathon) return new NextResponse(null, { status: 404 });
  const reports = await listParticipantReports(marathon.id);
  const header = [
    "name",
    "login",
    "email",
    "verified",
    "source",
    "streak",
    "finished",
    "converted",
    ...Array.from({ length: marathon.daysCount }, (_, index) => `day_${index + 1}`),
  ];
  const rows = reports.map((person) => {
    const scores = Array.from({ length: marathon.daysCount }, (_, index) => {
      const day = person.days.find((item) => item.dayNumber === index + 1);
      if (!day?.completed) return "";
      return `${day.score ?? ""}/${day.passed ? "pass" : "fail"}`;
    });
    return [
      person.displayName,
      person.login,
      person.email ?? "",
      person.emailVerified ? "1" : "0",
      parseUtmSource(person.source) ?? "",
      String(person.streak),
      person.finished ? "1" : "0",
      person.converted ? "1" : "0",
      ...scores,
    ];
  });
  const csv = toCsv([header, ...rows]);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="marathon-${marathon.slug}.csv"`,
      "cache-control": "no-store",
    },
  });
}
