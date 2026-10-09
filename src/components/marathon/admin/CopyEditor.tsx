"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { resetCopyAction, saveCopyAction } from "@/modules/marathons/daily/actions";
import {
  COPY_DEFAULTS,
  COPY_GROUPS,
  COPY_PREVIEW_SAMPLE,
  copyLengthWarning,
  renderCopy,
  telegramLimit,
  type CopyKey,
} from "@/modules/marathons/daily/copy";
import { parseCopyInput } from "@/modules/marathons/daily/forms";
import { AdminField, AdminTextarea, ValidatedForm } from "./ValidatedForm";
import css from "../marathon.module.css";

function CopyField({
  marathonId,
  copyKey,
  initial,
  custom,
}: {
  marathonId: number;
  copyKey: CopyKey;
  initial: string;
  custom: boolean;
}) {
  const t = useTranslations("Marathon");
  const [body, setBody] = useState(initial);
  const preview = renderCopy(body, COPY_PREVIEW_SAMPLE);
  const warning = copyLengthWarning(copyKey, body);
  const limit = telegramLimit(copyKey);
  return (
    <article className={css.card}>
      <ValidatedForm
        action={saveCopyAction}
        validate={parseCopyInput}
        className={css.stack}
        quiet
        submitLabel={t("save")}
      >
        <input type="hidden" name="marathonId" value={marathonId} />
        <input type="hidden" name="copyKey" value={copyKey} />
        <AdminField name="body" label={t(`copy.labels.${copyKey}`)} hint={t("copy.placeholdersHint")}>
          <AdminTextarea
            name="body"
            rows={copyKey.startsWith("bot_btn_") || copyKey === "bot_open_site" || copyKey === "bot_to_tasks" ? 2 : 6}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </AdminField>
        <p className={css.meta}>{t("copy.preview")}</p>
        <pre className={css.preview}>{preview}</pre>
        {warning === "message" ? (
          <p className={css.warn} role="status">{t("copy.tooLong", { limit })}</p>
        ) : null}
        {warning === "button" ? (
          <p className={css.warn} role="status">{t("copy.buttonLong", { limit })}</p>
        ) : null}
      </ValidatedForm>
      {custom ? (
        <form action={resetCopyAction}>
          <input type="hidden" name="marathonId" value={marathonId} />
          <input type="hidden" name="copyKey" value={copyKey} />
          <button type="submit" className={css.buttonQuiet}>{t("copy.reset")}</button>
        </form>
      ) : null}
    </article>
  );
}

export function CopyEditor({
  marathonId,
  overrides,
}: {
  marathonId: number;
  overrides: Partial<Record<CopyKey, string>>;
}) {
  const t = useTranslations("Marathon");
  return (
    <section className={css.stack} aria-labelledby="marathon-copy">
      <h2 id="marathon-copy">{t("copy.title")}</h2>
      <p className={css.lead}>{t("copy.lead")}</p>
      {COPY_GROUPS.map((group) => (
        <div key={group.id} className={css.stack}>
          <h3>{t(`copy.groups.${group.id}`)}</h3>
          {group.keys.map((key) => (
            <CopyField
              key={key}
              marathonId={marathonId}
              copyKey={key}
              initial={overrides[key] ?? COPY_DEFAULTS[key]}
              custom={Boolean(overrides[key])}
            />
          ))}
        </div>
      ))}
    </section>
  );
}
