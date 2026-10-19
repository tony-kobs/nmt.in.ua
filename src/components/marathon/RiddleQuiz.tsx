"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { checkRiddleAction } from "@/modules/marathons/daily/actions";
import type { PublicRiddle } from "@/modules/marathons/daily/riddleQuiz";
import css from "./marathon.module.css";

function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function RiddleCard({ riddle }: { riddle: PublicRiddle }) {
  const t = useTranslations("Marathon");
  const titleId = `riddle-${riddle.id}-title`;
  const [solved, setSolved] = useState(riddle.mode === "quiz" && riddle.solved);
  const [choiceId, setChoiceId] = useState<number | null>(
    riddle.mode === "quiz" && riddle.solved ? riddle.choiceId : null,
  );
  const [hint, setHint] = useState<string | null>(
    riddle.mode === "quiz" && riddle.solved ? riddle.hint : null,
  );
  const [lockedUntil, setLockedUntil] = useState<number | null>(
    riddle.mode === "quiz" && !riddle.solved ? riddle.lockedUntil : null,
  );
  const [wrongId, setWrongId] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useIsClient();
  const now = useNow(lockedUntil != null);
  const waiting = lockedUntil != null && (!mounted || lockedUntil > now);
  const seconds = mounted && lockedUntil != null && lockedUntil > now
    ? Math.ceil((lockedUntil - now) / 1000)
    : 0;

  if (riddle.mode === "text") {
    return (
      <article className={css.card} aria-labelledby={titleId}>
        <h3 id={titleId}>{riddle.title}</h3>
        <p>{riddle.body}</p>
        <p className={css.meta}>{t("riddleTextOnly")}</p>
      </article>
    );
  }

  async function choose(optionId: number) {
    if (pending || waiting || solved) return;
    setPending(true);
    setFailed(false);
    setWrongId(null);
    try {
      const result = await checkRiddleAction(riddle.id, optionId);
      if (result.status === "correct") {
        setSolved(true);
        setChoiceId(result.choiceId);
        setHint(result.hint);
        setLockedUntil(null);
      } else if (result.status === "wrong" || result.status === "locked") {
        setLockedUntil(result.retryAt);
        if (result.status === "wrong") setWrongId(optionId);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  let tone: "ok" | "wrong" | undefined;
  let status = "";
  if (pending) status = t("riddleChecking");
  else if (solved) {
    tone = "ok";
    status = t("riddleCorrect");
  } else if (mounted && waiting && seconds > 0) {
    tone = "wrong";
    status = wrongId != null
      ? t("riddleWrong", { seconds })
      : t("riddleLocked", { seconds });
  } else if (failed) {
    tone = "wrong";
    status = t("riddleError");
  }

  return (
    <article className={css.card} aria-labelledby={titleId}>
      <h3 id={titleId}>{riddle.title}</h3>
      <p>{riddle.body}</p>
      <div role="group" aria-labelledby={titleId} className={css.options}>
        {riddle.options.map((option) => {
          const right = solved && option.id === choiceId;
          const wrong = !solved && option.id === wrongId && waiting;
          const className = [
            css.option,
            css.riddleChoice,
            right ? css.optionRight : "",
            wrong ? css.optionWrong : "",
          ].filter(Boolean).join(" ");
          return (
            <button
              key={option.id}
              type="button"
              className={className}
              disabled={pending || waiting || solved}
              aria-pressed={right}
              onClick={() => void choose(option.id)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {status ? (
        <p className={css.riddleStatus} role="status" aria-live="polite" data-tone={tone}>
          {status}
        </p>
      ) : null}
      {solved && hint ? (
        <p className={css.reviewNote}>
          <span className={css.fieldLabel}>{t("riddleExplanation")}. </span>
          {hint}
        </p>
      ) : null}
    </article>
  );
}

export function RiddleQuiz({ riddles }: { riddles: PublicRiddle[] }) {
  const t = useTranslations("Marathon");
  const hasQuiz = riddles.some((riddle) => riddle.mode === "quiz");
  if (riddles.length === 0) return null;
  return (
    <section className={css.stack} aria-labelledby="marathon-riddles">
      <h2 id="marathon-riddles">{t("riddlesTitle")}</h2>
      {hasQuiz ? <p className={css.lead}>{t("riddleLead")}</p> : null}
      {riddles.map((riddle) => (
        <RiddleCard key={riddle.id} riddle={riddle} />
      ))}
    </section>
  );
}
