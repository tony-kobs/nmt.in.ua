import { getTranslations } from "next-intl/server";
import { MathText } from "@/components/ui/MathText";
import { previewChat } from "@/modules/marathons/daily/telegramContent";
import type { MarathonDay, Material } from "@/modules/marathons/daily/store";
import css from "../marathon.module.css";

function visibleText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export async function TelegramDayPreview({
  day,
}: {
  day: MarathonDay & {
    materials: Material[];
    tasks: Array<{ prompt: string; options: string[] }>;
  };
}) {
  const t = await getTranslations("Marathon");
  const bubbles = previewChat({
    introText: day.introText,
    materials: day.materials,
    tasks: day.tasks.map((task) => ({
      prompt: task.prompt,
      options: task.options,
    })),
    siteLabel: t("previewSite"),
  });
  return (
    <div className={css.tgPreview}>
      <h3 id={`tg-day-${day.id}`}>{t("telegramPreview")}</h3>
      <p className={css.lead}>{t("telegramPreviewLead")}</p>
      {bubbles.map((bubble, index) => (
        <div key={`${bubble.kind}-${index}`} className={css.tgBubble}>
          <p className={css.tgKind}>
            {bubble.kind === "video"
              ? t("previewVideo")
              : bubble.kind === "photo"
                ? t("previewPhoto")
                : bubble.kind === "formula"
                  ? t("previewFormula")
                  : bubble.kind === "task"
                    ? t("previewTask")
                    : t("previewText")}
          </p>
          {bubble.kind === "formula" ? (
            <MathText text={`$$${bubble.body}$$`} as="div" />
          ) : (
            <p className={css.tgBody}>{visibleText(bubble.body)}</p>
          )}
          {bubble.buttons.length > 0 ? (
            <div className={css.tgButtons}>
              {bubble.buttons.map((label, buttonIndex) => (
                <span key={`${label}-${buttonIndex}`} className={css.tgChip}>{label}</span>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
