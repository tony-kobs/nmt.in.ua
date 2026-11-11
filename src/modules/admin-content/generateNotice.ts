export type DiscardReasons = {
  answer: number;
  format: number;
};

type NoticeState = {
  saved: number;
  discarded: number;
  reasons?: DiscardReasons;
};

type NoticeTranslator = (key: string, values?: Record<string, string | number>) => string;

/** Short admin line. API failures are a separate error and never reach here. */
export function formatGenerateNotice(state: NoticeState, t: NoticeTranslator): string {
  const reasons = state.reasons ?? { answer: 0, format: 0 };
  const parts: string[] = [];
  if (reasons.answer > 0) parts.push(t("rejectedAnswer", { count: reasons.answer }));
  if (reasons.format > 0) parts.push(t("rejectedFormat", { count: reasons.format }));
  const summary =
    parts.length > 0
      ? t("rejectedSummary", {
          total: reasons.answer + reasons.format,
          details: parts.join(", "),
        })
      : "";
  if (state.saved === 0) return summary || t("generatedNone");
  const savedLine = t("generated", { saved: state.saved, discarded: state.discarded });
  return summary ? `${savedLine} ${summary}` : savedLine;
}
