import type { TodayPlan } from "@/modules/today/pickStudentToday";
import { html, navRow, siteButton } from "./ui";
import type { InlineKeyboard } from "./taskInteraction";

type Button = InlineKeyboard["inline_keyboard"][number][number];

/** One next step, the same first card the cabinet builds for `/`. */
export function formatTodayCard(plan: TodayPlan): { text: string; rows: Button[][] } {
  const lines = ["<b>📅 Сьогодні</b>", ""];
  let action: Button;
  switch (plan.id) {
    case "assignment": {
      const item = plan.assignment;
      const bits = [`Завдань: ${item.tasksNumber}`];
      if (item.dueAtLabel) bits.push(`до ${item.dueAtLabel}`);
      if (!item.canStart && item.availableAtLabel) bits.push(`відкриється ${item.availableAtLabel}`);
      if (plan.more > 0) bits.push(`ще ${plan.more}`);
      lines.push(`<b>${html(item.themeName)}</b>`, bits.join(" · "));
      action = siteButton(item.canStart ? "Почати" : "До сесії", `/session/${item.sessionId}`);
      break;
    }
    case "topic":
      lines.push("<b>Тест за темою</b>", "Обери тему і пройди коротку практику.");
      action = { text: "До тесту", callback_data: "mh:quiz" };
      break;
    case "simulator":
      lines.push("<b>Симулятор НМТ</b>", "Повний варіант у форматі іспиту.");
      action = siteButton("До симулятора", "/simulator");
      break;
    case "marathon-join":
      lines.push(`<b>${html(plan.title)}</b>`, "Є відкритий марафон. Можна долучитись і йти день за днем.");
      action = siteButton("До марафону", plan.href);
      break;
    case "marathon": {
      const day = plan.marathon;
      const dayLine = day.dayNumber == null
        ? null
        : day.topic
          ? `День ${day.dayNumber}: ${day.topic}`
          : `День ${day.dayNumber}`;
      const note = day.state === "day"
        ? "День уже відкритий."
        : day.state === "done"
          ? "Відкритий день уже зданий."
          : day.state === "setup"
            ? "Відкрийте марафон і оберіть, куди надсилати нагадування."
            : "День ще не відкрився.";
      lines.push(`<b>${html(day.title)}</b>`, dayLine ? `${html(dayLine)}. ${note}` : note);
      action = day.state === "day"
        ? { text: "До дня", callback_data: "mh:today" }
        : siteButton("До карти", day.href);
      break;
    }
    case "teacher":
      lines.push("<b>Викладач</b>", "Ти ще без викладача. На консультаціях можна обрати людину.");
      action = siteButton("До консультацій", "/consultations");
      break;
    case "advice":
      lines.push(`<b>${html(plan.advice.title)}</b>`, html(plan.advice.reason));
      action = siteButton("До матеріалів", plan.advice.href);
      break;
    case "textbook":
      lines.push("<b>Підручник</b>", "Переглянь розділ і освіжи формули.");
      action = siteButton("До підручника", "/materials/textbook");
      break;
  }
  return { text: lines.join("\n"), rows: [[action], navRow()] };
}
