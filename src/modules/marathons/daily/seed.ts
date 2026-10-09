import "server-only";

import { dayUnlockAt } from "./calendar";
import { MATH_MARATHON_SEED } from "./seedData";
import {
  getDailyBySlug,
  insertDailyMarathon,
  insertDay,
  insertMaterial,
  insertRiddle,
  insertTask,
} from "./store";

export async function seedMathMarathon(): Promise<"created" | "exists"> {
  const existing = await getDailyBySlug(MATH_MARATHON_SEED.slug);
  if (existing) return "exists";
  const startsAt = Math.floor(
    dayUnlockAt({
      startDate: MATH_MARATHON_SEED.startDate,
      unlockHour: MATH_MARATHON_SEED.unlockHour,
      dayNumber: 1,
    }).getTime() / 1000,
  );
  const endsAt = Math.floor(
    dayUnlockAt({
      startDate: MATH_MARATHON_SEED.startDate,
      unlockHour: MATH_MARATHON_SEED.unlockHour,
      dayNumber: MATH_MARATHON_SEED.daysCount + 1,
    }).getTime() / 1000,
  );
  const marathonId = await insertDailyMarathon({
    slug: MATH_MARATHON_SEED.slug,
    title: MATH_MARATHON_SEED.title,
    subject: MATH_MARATHON_SEED.subject,
    startDate: MATH_MARATHON_SEED.startDate,
    unlockHour: MATH_MARATHON_SEED.unlockHour,
    daysCount: MATH_MARATHON_SEED.daysCount,
    passThreshold: MATH_MARATHON_SEED.passThreshold,
    finalCtaText: MATH_MARATHON_SEED.finalCtaText,
    finalCtaUrl: MATH_MARATHON_SEED.finalCtaUrl,
    introVideoUrl: "",
    startsAt,
    endsAt,
  });
  for (const riddle of MATH_MARATHON_SEED.riddles) {
    await insertRiddle(marathonId, riddle);
  }
  for (const day of MATH_MARATHON_SEED.days) {
    const dayId = await insertDay(marathonId, {
      dayNumber: day.dayNumber,
      topic: day.topic,
      introText: day.introText,
    });
    await insertMaterial(dayId, {
      order: 1,
      type: "text",
      urlOrBody: day.material,
    });
    for (const task of day.tasks) {
      await insertTask(dayId, {
        order: task.order,
        questionId: null,
        prompt: task.prompt,
        options: task.options,
        correct: task.correct,
      });
    }
  }
  return "created";
}
