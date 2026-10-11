import { handleNotificationTrigger } from "@/modules/telegram/notificationTrigger";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return handleNotificationTrigger(request);
}
