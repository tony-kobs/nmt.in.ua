import { handleMarathonNotificationsProcess } from "@/modules/marathons/daily/cronRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return handleMarathonNotificationsProcess(request);
}
