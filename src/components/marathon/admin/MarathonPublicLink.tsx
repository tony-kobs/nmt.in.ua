"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import css from "../marathon.module.css";

export function MarathonPublicLink({
  href,
  draft,
  prominent,
}: {
  href: string;
  draft: boolean;
  prominent?: boolean;
}) {
  const t = useTranslations("Marathon");
  const noteId = useId();
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  }

  return (
    <div className={prominent ? `${css.publicLink} ${css.publicLinkProminent}` : css.publicLink}>
      <p className={css.meta}>{t("publicLinkLabel")}</p>
      <div className={css.linkRow}>
        <a
          className={css.publicHref}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-describedby={draft ? noteId : undefined}
        >
          {href}
        </a>
        <button
          type="button"
          className={css.buttonQuiet}
          onClick={() => void copy()}
          aria-live="polite"
        >
          {copied === "ok" ? t("copied") : t("copyLink")}
        </button>
      </div>
      {copied === "fail" ? (
        <p className={css.fieldError} role="alert">
          {t("copyFailed")}
        </p>
      ) : null}
      {draft ? (
        <p id={noteId} className={css.meta}>
          {t("draftHidden", { status: t("status.active") })}
        </p>
      ) : null}
    </div>
  );
}
