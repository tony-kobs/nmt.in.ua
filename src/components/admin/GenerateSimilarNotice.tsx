"use client";

import { useTranslations } from "next-intl";
import {
  formatGenerateNotice,
  type DiscardReasons,
} from "@/modules/admin-content/generateNotice";

export function GenerateSimilarNotice({
  state,
  className,
}: {
  state: { saved: number; discarded: number; reasons?: DiscardReasons };
  className: string;
}) {
  const t = useTranslations("AdminContent");
  const text = formatGenerateNotice(state, (key, values) => {
    if (!values) return t(key as "generatedNone");
    return t(key as "generated", values as { saved: number; discarded: number });
  });
  return (
    <p className={className} role="status">
      {text}
    </p>
  );
}
