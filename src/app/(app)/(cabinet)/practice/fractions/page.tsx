import { FractionPracticeTrainer } from "@/components/practice/FractionPracticeTrainer";
import { createPageMetadata } from "@/constants/seo";
import { requireSessionUserId } from "@/modules/auth/getCurrentUser";

export async function generateMetadata() {
  return createPageMetadata({
    title: "Додавання дробів",
    description:
      "Практика: додавання дробів з однаковим знаменником — п'ять рівнів складності.",
    path: "/practice/fractions",
    noIndex: true,
  });
}

/**
 * Ephemeral generated-task practice: every task comes from
 * `problemGenerators/fractionAddition` at request time, nothing is read from
 * or written to `quiz_tasks` / `task_sessions`. See
 * `src/modules/fractionPractice/actions.ts` for why that's enough (the task
 * is reproduced server-side from `{ level, seed }` for validation, never
 * persisted).
 */
export default async function FractionPracticePage() {
  await requireSessionUserId();
  return <FractionPracticeTrainer />;
}
