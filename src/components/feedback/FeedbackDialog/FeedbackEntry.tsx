"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import type { FeedbackSource } from "@/modules/feedback/types";
import { FeedbackDialog } from "./FeedbackDialog";
import css from "./FeedbackDialog.module.css";

type FeedbackEntryProps = {
  source: FeedbackSource;
  isGuest: boolean;
  triggerClassName?: string;
  variant?: "link" | "sidebar";
  tabIndex?: number;
};

export function FeedbackEntry({
  source,
  isGuest,
  triggerClassName,
  variant = "link",
  tabIndex,
}: FeedbackEntryProps) {
  const t = useTranslations("Feedback");
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const triggerClass =
    variant === "sidebar"
      ? clsx(css.trigger, css.sidebarTrigger)
      : (triggerClassName ?? css.trigger);

  return (
    <>
      <button
        type="button"
        className={triggerClass}
        tabIndex={tabIndex}
        onClick={() => setOpen(true)}
      >
        {t("leaveReview")}
      </button>
      <FeedbackDialog
        open={open}
        onClose={close}
        source={source}
        isGuest={isGuest}
      />
    </>
  );
}
