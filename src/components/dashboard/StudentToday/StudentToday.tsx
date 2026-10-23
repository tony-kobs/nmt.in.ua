import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame";
import {
  buildTodayPlans,
  type StudentTodayModel,
  type TodayDiagnostic,
  type TodayPlan,
} from "@/modules/today/pickStudentToday";
import css from "./StudentToday.module.css";

type StudentTodayProps = {
  displayName: string;
  model: StudentTodayModel;
};

type PlanCopy = {
  title: string;
  text: string;
  href: string;
  link: string;
};

export async function StudentToday({ displayName, model }: StudentTodayProps) {
  const t = await getTranslations("StudentToday");
  const plans = buildTodayPlans(model);

  return (
    <PageFrame
      className={css.frame}
      title={t("title")}
      lead={
        <>
          {t("hello")} {displayName}
        </>
      }
    >
      <DiagnosticNote note={model.diagnostic} />
      <section className={css.block} aria-labelledby="today-plans">
        <h2 id="today-plans" className={css.question}>
          {t("question")}
        </h2>
        <ul className={css.rail}>
          {plans.map((plan, index) => {
            const copy = planCopy(plan, t);
            return (
              <li key={plan.id} className={css.slip}>
                <p className={css.index} aria-hidden>
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className={css.slipTitle}>{copy.title}</h3>
                <p className={css.slipText}>{copy.text}</p>
                <Link href={copy.href} className={css.link}>
                  {copy.link}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </PageFrame>
  );
}

async function DiagnosticNote({ note }: { note: TodayDiagnostic }) {
  const t = await getTranslations("StudentToday");

  if (note.kind === "offer") {
    return (
      <p className={css.note}>
        {t("diagnosticOffer")}{" "}
        <Link href="/diagnostic" className={css.noteLink}>
          {t("diagnosticOfferLink")}
        </Link>
      </p>
    );
  }

  if (note.perfect) {
    return (
      <p className={css.note}>
        {t("diagnosticPerfect", { right: note.right, total: note.total })}
      </p>
    );
  }

  return (
    <p className={css.note}>
      {t("diagnosticScore", {
        right: note.right,
        total: note.total,
        percent: note.percentLabel,
      })}{" "}
      {note.themeName && note.themeHref ? (
        <>
          <Link href={note.themeHref} className={css.noteLink}>
            {t("diagnosticStart", { theme: note.themeName })}
          </Link>{" "}
          {t("diagnosticLuck")}
        </>
      ) : (
        t("diagnosticNoTheme")
      )}
    </p>
  );
}

function planCopy(
  plan: TodayPlan,
  t: (key: string, values?: Record<string, string | number>) => string,
): PlanCopy {
  switch (plan.id) {
    case "assignment": {
      const item = plan.assignment;
      const bits = [t("tasks", { count: item.tasksNumber })];
      if (item.dueAtLabel) bits.push(t("due", { when: item.dueAtLabel }));
      if (!item.canStart && item.availableAtLabel) {
        bits.push(t("opensAt", { when: item.availableAtLabel }));
      }
      if (plan.more > 0) bits.push(t("assignmentMore", { count: plan.more }));
      return {
        title: item.themeName,
        text: bits.join(" · "),
        href: `/session/${item.sessionId}`,
        link: item.canStart ? t("start") : t("openSession"),
      };
    }
    case "topic":
      return {
        title: t("topicTitle"),
        text: t("topicText"),
        href: "/topic",
        link: t("topicLink"),
      };
    case "simulator":
      return {
        title: t("simulatorTitle"),
        text: t("simulatorText"),
        href: "/simulator",
        link: t("simulatorLink"),
      };
    case "marathon-join":
      return {
        title: plan.title,
        text: t("joinText"),
        href: plan.href,
        link: t("joinLink"),
      };
    case "marathon": {
      const day = plan.marathon;
      const dayLine =
        day.dayNumber == null
          ? null
          : day.topic
            ? t("dayWithTopic", { day: day.dayNumber, topic: day.topic })
            : t("dayOnly", { day: day.dayNumber });
      const note =
        day.state === "day"
          ? t("marathonDayText")
          : day.state === "done"
            ? t("marathonDone")
            : day.state === "setup"
              ? t("marathonSetup")
              : t("marathonWaiting");
      return {
        title: day.title,
        text: dayLine ? `${dayLine}. ${note}` : note,
        href: day.href,
        link: day.state === "day" ? t("openDay") : t("openMap"),
      };
    }
    case "teacher":
      return {
        title: t("teacherTitle"),
        text: t("teacherText"),
        href: "/consultations",
        link: t("teacherLink"),
      };
    case "advice":
      return {
        title: plan.advice.title,
        text: plan.advice.reason,
        href: plan.advice.href,
        link: t("adviceLink"),
      };
    case "textbook":
      return {
        title: t("textbookTitle"),
        text: t("textbookText"),
        href: "/materials/textbook",
        link: t("textbookLink"),
      };
  }
}
