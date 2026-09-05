"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { ModeTabs } from "@/components/ui/ModeTabs";
import { submitFeedbackAction } from "@/modules/feedback/actions";
import type { SubmitFeedbackActionErrorCode } from "@/modules/feedback/actions";
import {
  MESSAGE_MAX_LEN,
  isFeedbackCommentRequired,
  type FeedbackSource,
} from "@/modules/feedback/types";
import css from "./FeedbackDialog.module.css";

const SCORE_IDS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
] as const;
type ScoreId = (typeof SCORE_IDS)[number];
type ScoreTab = ScoreId | "none";

type FeedbackDialogProps = {
  open: boolean;
  onClose: () => void;
  source: FeedbackSource;
  sessionId?: number;
  isGuest: boolean;
};

export function FeedbackDialog({
  open,
  onClose,
  source,
  sessionId,
  isGuest,
}: FeedbackDialogProps) {
  const t = useTranslations("Feedback");
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState<ScoreTab>("none");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<SubmitFeedbackActionErrorCode | null>(
    null,
  );
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const numericScore = score === "none" ? null : Number(score);
  const showMessage =
    numericScore !== null && isFeedbackCommentRequired(numericScore);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (numericScore === null || pending) return;

    setPending(true);
    setErrorCode(null);

    const result = await submitFeedbackAction({
      score: numericScore,
      message: showMessage ? message : "",
      email: isGuest ? email : undefined,
      source,
      sessionId,
    });

    setPending(false);

    if (result.status !== "success") {
      setErrorCode(result.code);
      return;
    }

    setDone(true);
  }

  // Sidebar uses transform + overflow, which would trap position:fixed.
  return createPortal(
    <div className={css.overlay} role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className={css.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        {done ? (
          <div className={css.success}>
            <p className={css.kicker}>{t("kicker")}</p>
            <h2 id={titleId} className={css.title}>
              {t("thanksTitle")}
            </h2>
            <p className={css.lead}>{t("thanksLead")}</p>
            <div className={css.actions}>
              <button type="button" className={css.submit} onClick={onClose}>
                {t("close")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <header>
              <p className={css.kicker}>{t("kicker")}</p>
              <h2 id={titleId} className={css.title}>
                {t("title")}
              </h2>
              <p className={css.lead}>{t("lead")}</p>
            </header>

            <form className={css.form} onSubmit={(event) => void handleSubmit(event)}>
              <div className={css.field}>
                <span className={css.label} id={`${titleId}-score`}>
                  {t("scoreLabel")}
                </span>
                <div className={css.scoreWrap}>
                  <ModeTabs<ScoreTab>
                    value={score}
                    onChange={(next) => {
                      setScore(next);
                      setErrorCode(null);
                    }}
                    options={SCORE_IDS.map((id) => ({
                      id,
                      label: t("scoreValue", { score: id }),
                    }))}
                    ariaLabel={t("scoreAria")}
                  />
                </div>
                {score === "none" ? (
                  <p className={css.hint}>{t("scoreHint")}</p>
                ) : null}
              </div>

              {showMessage ? (
                <label className={css.field}>
                  <span className={css.prompt}>{t("messageRequired")}</span>
                  <textarea
                    className={css.textarea}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    maxLength={MESSAGE_MAX_LEN}
                    required
                    disabled={pending}
                  />
                </label>
              ) : null}

              {isGuest ? (
                <label className={css.field}>
                  <span className={css.label}>{t("emailLabel")}</span>
                  <input
                    className={css.input}
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    disabled={pending}
                  />
                  <span className={css.hint}>{t("emailHint")}</span>
                </label>
              ) : null}

              {errorCode ? (
                <p className={clsx(css.alert, css.alertError)} role="alert">
                  {t(`errors.${errorCode}`)}
                </p>
              ) : null}

              <div className={css.actions}>
                <button
                  type="submit"
                  className={css.submit}
                  disabled={pending || score === "none"}
                >
                  {pending ? t("sending") : t("submit")}
                </button>
                <button
                  type="button"
                  className={css.later}
                  onClick={onClose}
                  disabled={pending}
                >
                  {t("later")}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
