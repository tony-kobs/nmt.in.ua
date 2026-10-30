import assert from "node:assert/strict";
import test from "node:test";
import { dayUnlockAt } from "./calendar";
import {
  SITEMAP_DAILY_STATUSES,
  calendarDate,
  marathonJoinNextPath,
  publicMarathonPhase,
} from "./publicPage";

const COURSE = {
  status: "active",
  startDate: "2026-11-02",
  unlockHour: "09:00",
  daysCount: 5,
};

const OPENS = dayUnlockAt({ startDate: COURSE.startDate, unlockHour: COURSE.unlockHour, dayNumber: 1 });

test("public marathon page parks until day 1 unlocks, then opens", () => {
  assert.equal(publicMarathonPhase(COURSE, new Date(OPENS.getTime() - 1)), "parking");
  assert.equal(publicMarathonPhase(COURSE, OPENS), "open");
});

test("draft stays on the waiting page even after the scheduled start", () => {
  assert.equal(publicMarathonPhase({ ...COURSE, status: "draft" }, OPENS), "parking");
});

test("finished stays on results and archived or unknown slugs stay hidden", () => {
  assert.equal(publicMarathonPhase({ ...COURSE, status: "finished" }, new Date(0)), "finished");
  assert.equal(publicMarathonPhase({ ...COURSE, status: "archived" }, OPENS), "hidden");
  assert.equal(publicMarathonPhase({ ...COURSE, status: "paused" }, OPENS), "hidden");
  assert.equal(publicMarathonPhase(null, OPENS), "hidden");
});

test("active course with no readable start stays on the waiting page", () => {
  assert.equal(publicMarathonPhase({ ...COURSE, startDate: "" }, OPENS), "parking");
  assert.equal(publicMarathonPhase({ ...COURSE, unlockHour: "bad" }, OPENS), "parking");
  assert.equal(
    publicMarathonPhase({ ...COURSE, status: "finished", startDate: "" }, OPENS),
    "finished",
  );
});

test("join returns to the waiting page until the course is open", () => {
  assert.equal(
    marathonJoinNextPath("pilot", { status: "draft" }),
    "/marathon/pilot?joined=1",
  );
  assert.equal(
    marathonJoinNextPath("pilot", { ...COURSE, status: "active" }, new Date(OPENS.getTime() - 1)),
    "/marathon/pilot?joined=1",
  );
  assert.equal(
    marathonJoinNextPath("pilot", { status: "active", startDate: "" }),
    "/marathon/pilot?joined=1",
  );
  assert.equal(
    marathonJoinNextPath("pilot", COURSE, OPENS),
    "/marathon/pilot/map",
  );
  assert.equal(
    marathonJoinNextPath("math-5", { status: "active" }),
    "/marathon/math-5/map",
  );
});

test("sitemap lists shareable daily courses and skips the archive", () => {
  assert.deepEqual([...SITEMAP_DAILY_STATUSES], ["draft", "active", "finished"]);
  assert.equal((SITEMAP_DAILY_STATUSES as readonly string[]).includes("archived"), false);
});

test("calendar dates survive CHAR, DATETIME prefixes and Date values", () => {
  assert.equal(calendarDate("2026-11-02"), "2026-11-02");
  assert.equal(calendarDate("2026-11-02 00:00:00"), "2026-11-02");
  assert.equal(calendarDate(new Date(2026, 10, 2, 15, 30)), "2026-11-02");
  assert.equal(calendarDate(Buffer.from("2026-11-02")), "2026-11-02");
  assert.equal(calendarDate(null), "");
  assert.equal(calendarDate("not-a-date"), "");
});
