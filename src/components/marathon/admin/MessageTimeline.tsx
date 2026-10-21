import { buildMessageTimeline, type TimelineDay } from "@/modules/marathons/daily/messageTimeline";
import { loadTimelineSnapshot } from "@/modules/marathons/daily/messageOverrides";
import type { DailyMarathon, MarathonDay } from "@/modules/marathons/daily/store";
import { TimelinePanel } from "./TimelinePanel";
import { marathonSectionStorageKey } from "./settingsSections";

export async function MessageTimeline({
  marathon,
  days,
}: {
  marathon: Pick<DailyMarathon, "id" | "slug" | "status" | "startDate" | "unlockHour" | "reminderHour" | "nudgeFrom" | "nudgeUntil">;
  days: Array<Pick<MarathonDay, "dayNumber" | "topic"> & { tasks: unknown[] }>;
}) {
  const content = days
    .filter((day) => day.tasks.length > 0)
    .map((day) => ({ dayNumber: day.dayNumber, topic: day.topic }));
  let groups: TimelineDay[] = [];
  let failed = false;
  try {
    const snapshot = await loadTimelineSnapshot(marathon.id);
    groups = buildMessageTimeline({
      schedule: {
        startDate: marathon.startDate,
        unlockHour: marathon.unlockHour,
        reminderHour: marathon.reminderHour,
        nudgeFrom: marathon.nudgeFrom,
        nudgeUntil: marathon.nudgeUntil,
        days: content,
      },
      linkBase: `/marathon/${marathon.slug}`,
      hold: marathon.status === "archived",
      ...snapshot,
    });
  } catch (error) {
    console.error("message timeline", error);
    failed = true;
  }
  const empty = content.length === 0 && groups.every((group) => group.items.length === 0);
  return (
    <TimelinePanel
      marathonId={marathon.id}
      archived={marathon.status === "archived"}
      failed={failed}
      empty={empty}
      groups={groups}
      storageKey={marathonSectionStorageKey(String(marathon.id))}
    />
  );
}
