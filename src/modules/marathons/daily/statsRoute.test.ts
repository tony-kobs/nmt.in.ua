import assert from "node:assert/strict";
import test from "node:test";

import type { DailyFunnel } from "./dailyStats";
import { handleMarathonStats } from "./statsRoute";

const funnel: DailyFunnel = {
  slug: "math-5",
  registered: 3,
  telegramLinked: 2,
  finished: 1,
  days: [{ day: 1, opened: 2, completed: 1, avgScore: 70, avgTimeSec: null, medianTimeSec: null, dropoff: 2 }],
  ticketsOpen: 0,
  deliveryErrors24h: 0,
};

function request(slug: string | null, authorization?: string): Request {
  const url = new URL("http://localhost/api/marathon/stats");
  if (slug != null) url.searchParams.set("marathon", slug);
  return new Request(url, { headers: authorization ? { authorization } : {} });
}

test("stats require the cron bearer and do not leak another marathon", async () => {
  const previous = process.env.MARATHON_CRON_SECRET;
  process.env.MARATHON_CRON_SECRET = "stats-test-secret";
  let asked = "";
  try {
    const missing = await handleMarathonStats(request("math-5"));
    assert.equal(missing.status, 401);
    assert.equal(await missing.text(), "");
    const wrong = await handleMarathonStats(request("math-5", "Bearer other"));
    assert.equal(wrong.status, 401);
    const bad = await handleMarathonStats(request("../other", "Bearer stats-test-secret"), {
      load: async (slug: string) => {
        asked = slug;
        return funnel;
      },
    });
    assert.equal(bad.status, 400);
    assert.equal(asked, "");
    const absent = await handleMarathonStats(request(null, "Bearer stats-test-secret"));
    assert.equal(absent.status, 400);
    const unknown = await handleMarathonStats(request("missing-course", "Bearer stats-test-secret"), {
      load: async (slug: string) => {
        asked = slug;
        return null;
      },
    });
    assert.equal(unknown.status, 404);
    assert.equal(await unknown.text(), "");
    assert.equal(asked, "missing-course");
    const ok = await handleMarathonStats(request("Math-5", "Bearer stats-test-secret"), {
      load: async () => funnel,
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "no-store");
    assert.deepEqual(await ok.json(), funnel);
  } finally {
    if (previous == null) delete process.env.MARATHON_CRON_SECRET;
    else process.env.MARATHON_CRON_SECRET = previous;
  }
});
