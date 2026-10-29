"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MaterialDocument } from "@/components/learningMaterials/MaterialDocument";
import { askConfirm } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { formatKyivDateTime } from "@/lib/relativeTime";
import {
  loadTextbookVersionAction,
  restoreTextbookVersionAction,
} from "@/modules/textbook/actions";
import type { TextbookVersionSummary } from "@/modules/textbook/draftTypes";
import { parseTextbookMarkup } from "@/modules/textbook/markup";
import css from "./TextbookEditor.module.css";
import { useBankTaskLookup } from "./useBankTasks";

type TextbookVersionListProps = {
  code: string;
  versions: TextbookVersionSummary[];
  revision: number;
  locked: boolean;
  onRestored: (next: { body: string; revision: number; savedAt: string }) => void;
  onConflict: () => void;
};

export function TextbookVersionList({
  code,
  versions,
  revision,
  locked,
  onRestored,
  onConflict,
}: TextbookVersionListProps) {
  const t = useTranslations("TextbookEditor");
  const locale = useLocale();
  const [openId, setOpenId] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const blocks = useMemo(() => (preview === null ? [] : parseTextbookMarkup(preview)), [preview]);
  const bankLookup = useBankTaskLookup(preview ?? "");

  async function toggle(id: number) {
    if (openId === id) {
      setOpenId(null);
      setPreview(null);
      setMissing(false);
      return;
    }
    setOpenId(id);
    setPreview(null);
    setMissing(false);
    setLoading(true);
    const loaded = await loadTextbookVersionAction(code, id);
    setLoading(false);
    if (!loaded) {
      setMissing(true);
      return;
    }
    setPreview(loaded.body);
  }

  async function restore(id: number) {
    const ok = await askConfirm(t("versionsRestoreConfirm"));
    if (!ok) return;
    setBusy(true);
    const result = await restoreTextbookVersionAction({
      code,
      versionId: id,
      expectedRevision: revision,
    });
    setBusy(false);
    if (!result.ok) {
      if (result.reason === "conflict") onConflict();
      else setMissing(true);
      return;
    }
    if (result.body === undefined) {
      setMissing(true);
      return;
    }
    onRestored({ body: result.body, revision: result.revision, savedAt: result.savedAt });
  }

  return (
    <section className={css.versions} aria-labelledby="textbook-versions-title">
      <h2 id="textbook-versions-title" className={css.previewTitle}>
        {t("versionsTitle")}
      </h2>
      <p className={css.note}>{t("versionsRestoreNote")}</p>
      {versions.length === 0 ? <p className={css.empty}>{t("versionsEmpty")}</p> : null}
      {missing ? (
        <p className={css.error} role="alert">
          {t("versionsMissing")}
        </p>
      ) : null}
      <ul className={css.versionList}>
        {versions.map((item) => {
          const open = openId === item.id;
          return (
            <li key={item.id} className={css.versionRow}>
              <p className={css.versionMeta}>
                {t("versionsBy", {
                  name: item.authorName,
                  time: formatKyivDateTime(item.createdAt, locale),
                })}
              </p>
              <button
                className={css.quiet}
                type="button"
                aria-expanded={open}
                onClick={() => void toggle(item.id)}
              >
                {open ? t("versionsClose") : t("versionsPreview")}
              </button>
              <button
                className={css.quiet}
                type="button"
                disabled={locked || busy}
                onClick={() => void restore(item.id)}
              >
                {t("versionsRestore")}
              </button>
              {open ? (
                <div className={css.versionPreview}>
                  {loading ? <p className={css.note}>{t("versionsLoading")}</p> : null}
                  {!loading && preview !== null && blocks.length > 0 ? (
                    <MaterialDocument
                      blocks={blocks}
                      bankTasks={bankLookup.tasks}
                      bankMode={bankLookup.settled ? "admin" : "student"}
                    />
                  ) : null}
                  {!loading && preview !== null && blocks.length === 0 ? (
                    <p className={css.empty}>{t("draftEmpty")}</p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
