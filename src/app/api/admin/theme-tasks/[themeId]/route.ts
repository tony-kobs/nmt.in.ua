import { NextResponse } from "next/server";
import { getCurrentUser, readLiveAccount } from "@/modules/auth/getCurrentUser";
import { canImportContent } from "@/modules/auth/types";
import { exportTopicTasks } from "@/modules/admin-content/topicTaskFileStore";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ themeId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  const account = user ? await readLiveAccount(user.id) : null;
  if (!account || account.isBanned || !canImportContent(account.role)) {
    return new NextResponse(null, { status: 401 });
  }
  const themeId = Number((await params).themeId);
  if (!Number.isInteger(themeId) || themeId <= 0) return new NextResponse(null, { status: 404 });
  const format = new URL(request.url).searchParams.get("format");
  const kind = format === "json" || format === "xlsx" ? format : "csv";
  const file = await exportTopicTasks(themeId, kind);
  if (!file) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(file.body), {
    headers: {
      "content-type": file.contentType,
      "content-disposition": `attachment; filename="${file.filename}"`,
      "cache-control": "no-store",
    },
  });
}
