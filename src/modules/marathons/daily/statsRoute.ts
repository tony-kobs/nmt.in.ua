import { isMarathonCronAuthorized } from "./notificationsJob";
import { isSlug } from "./forms";
import type { DailyFunnel } from "./dailyStats";
import { loadDailyFunnelBySlug } from "./dailyStatsStore";

const NO_STORE = { "cache-control": "no-store" };

export async function handleMarathonStats(
  request: Request,
  deps: {
    authorized?: (header: string | null) => boolean;
    load?: (slug: string) => Promise<DailyFunnel | null>;
  } = {},
): Promise<Response> {
  const authorized = deps.authorized ?? isMarathonCronAuthorized;
  if (!authorized(request.headers.get("authorization"))) {
    return new Response(null, { status: 401, headers: NO_STORE });
  }
  const slug = new URL(request.url).searchParams.get("marathon")?.trim().toLowerCase() ?? "";
  if (!isSlug(slug)) return new Response(null, { status: 400, headers: NO_STORE });
  try {
    const funnel = await (deps.load ?? loadDailyFunnelBySlug)(slug);
    if (!funnel) return new Response(null, { status: 404, headers: NO_STORE });
    return Response.json(funnel, { headers: NO_STORE });
  } catch (error) {
    console.error("marathon stats", error);
    return new Response(null, { status: 500, headers: NO_STORE });
  }
}
