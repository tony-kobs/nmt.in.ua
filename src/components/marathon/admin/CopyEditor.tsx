"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { resetCopyAction, saveCopyAction } from "@/modules/marathons/daily/actions";
import {
  COPY_DEFAULTS,
  COPY_GROUPS,
  COPY_PREVIEW_SAMPLE,
  copyFieldMatches,
  copyLengthWarning,
  renderCopy,
  telegramLimit,
  type CopyKey,
} from "@/modules/marathons/daily/copy";
import { parseCopyInput } from "@/modules/marathons/daily/forms";
import { AccordionSection } from "./SettingsAccordion";
import { marathonSectionStorageKey } from "./settingsSections";
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
  const [query, setQuery] = useState("");
  const storageKey = marathonSectionStorageKey(String(marathonId));
  const customCount = Object.keys(overrides).length;
  const searching = query.trim().length > 0;
  const groups = COPY_GROUPS.map((group) => {
    const label = t(`copy.groups.${group.id}`);
    const groupHit = copyFieldMatches(query, [label]);
    const keys = group.keys.filter((key) => groupHit || copyFieldMatches(query, [
      key,
      t(`copy.labels.${key}`),
      overrides[key] ?? COPY_DEFAULTS[key],
    ]));
    return { ...group, label, keys };
  }).filter((group) => !searching || group.keys.length > 0);
  return (
    <AccordionSection
      id="texts"
      title={t("sections.texts")}
      summary={customCount > 0 ? t("sections.textsCustom", { count: customCount }) : t("sections.textsDefault")}
      storageKey={storageKey}
    >
      <p className={css.lead}>{t("copy.lead")}</p>
      <label className={css.field}>
        <span>{t("copy.searchLabel")}</span>
        <input
          className={css.input}
          type="search"
          value={query}
          placeholder={t("copy.searchPlaceholder")}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {groups.length === 0 ? <p className={css.hint}>{t("copy.searchEmpty")}</p> : null}
      {groups.map((group) => {
        const source = COPY_GROUPS.find((item) => item.id === group.id);
        const custom = source?.keys.filter((key) => overrides[key]).length ?? 0;
        const total = source?.keys.length ?? group.keys.length;
        return (
          <AccordionSection
            key={group.id}
            id={`copy-${group.id}`}
            title={group.label}
            summary={t("copy.groupStats", { total, custom, plain: total - custom })}
            keepSummary
            forceOpen={searching}
            headingLevel="h3"
            storageKey={storageKey}
          >
            {group.keys.map((key) => (
              <CopyField
                key={key}
                marathonId={marathonId}
                copyKey={key}
                initial={overrides[key] ?? COPY_DEFAULTS[key]}
                custom={Boolean(overrides[key])}
              />
            ))}
          </AccordionSection>
        );
      })}
    </AccordionSection>
  );
}
