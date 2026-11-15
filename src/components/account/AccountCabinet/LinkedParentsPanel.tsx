"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { unlinkParentAction } from "@/modules/parent-students/actions";
import type { LinkedParent } from "@/modules/parent-students/unlinkParent";
import css from "./AccountCabinet.module.css";

export function LinkedParentsPanel({ parents }: { parents: LinkedParent[] }) {
  const t = useTranslations("AccountCabinet");
  const router = useRouter();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState(false);

  async function unlink(parent: LinkedParent) {
    if (pendingId !== null) return;
    if (!window.confirm(t("unlinkConfirm", { name: parent.displayName }))) return;
    setPendingId(parent.id);
    setError(false);
    try {
      const result = await unlinkParentAction(parent.id);
      if (result.status !== "ok") {
        setError(true);
        return;
      }
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className={css.panel} aria-labelledby="account-parents-title">
      <h2 id="account-parents-title" className={css.panelTitle}>{t("linkedParentsTitle")}</h2>
      <p className={css.panelLead}>{t("linkedParentsLead")}</p>
      {parents.length === 0 ? <p role="status">{t("linkedParentsEmpty")}</p> : (
        <ul className={css.parentList}>
          {parents.map((parent) => (
            <li key={parent.id} className={css.parentRow}>
              <span className={css.parentName}>{parent.displayName}</span>
              <button
                type="button"
                className={css.joinQuiet}
                disabled={pendingId !== null}
                onClick={() => unlink(parent)}
              >
                {pendingId === parent.id ? t("unlinkPending") : t("unlinkParent")}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? <p className={css.alertError} role="alert">{t("unlinkError")}</p> : null}
    </section>
  );
}
