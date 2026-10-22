import { handleMarathonStats } from "@/modules/marathons/daily/statsRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleMarathonStats(request);
}
