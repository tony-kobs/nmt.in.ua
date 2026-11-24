"use client";

import { useTranslations } from "next-intl";
import { askConfirm } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { deleteDayAction } from "@/modules/marathons/daily/actions";
import { ConfirmSubmit } from "../ConfirmSubmit";
import css from "../marathon.module.css";

export function DeleteDayButton({
  marathonId,
  dayId,
  slug,
  dayNumber,
  submissions,
}: {
  marathonId: number;
  dayId: number;
  slug: string;
  dayNumber: number;
  submissions: number;
}) {
  const t = useTranslations("Marathon");
  if (submissions > 0) {
    return (
      <button
        type="button"
        className={css.buttonDanger}
        onClick={() => {
          void askConfirm(t("deleteDayBlocked", { n: dayNumber, count: submissions }));
        }}
      >
        {t("deleteDay")}
      </button>
    );
  }
  return (
    <form action={deleteDayAction}>
      <input type="hidden" name="marathonId" value={marathonId} />
      <input type="hidden" name="dayId" value={dayId} />
      <input type="hidden" name="slug" value={slug} />
      <ConfirmSubmit
        message={t("deleteDayConfirm", { n: dayNumber })}
        pendingLabel={t("deleting")}
        className={css.buttonDanger}
      >
        {t("deleteDay")}
      </ConfirmSubmit>
    </form>
  );
}
