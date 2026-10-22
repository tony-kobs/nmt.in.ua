import { handleMarathonCronHealth } from "@/modules/marathons/daily/cronRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleMarathonCronHealth(request);
}
