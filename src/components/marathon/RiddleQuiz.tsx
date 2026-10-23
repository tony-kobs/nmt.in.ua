"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { checkRiddleAction } from "@/modules/marathons/daily/actions";
import type { PublicRiddle } from "@/modules/marathons/daily/riddleQuiz";
import { TestTaskCard, optionLetter } from "@/components/testing/TestTaskCard";
import cardCss from "@/components/testing/TestTaskCard/TestTaskCard.module.css";
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
      <TestTaskCard
        heading="h3"
        titleId={titleId}
        title={riddle.title}
        badge={t("riddlesTitle")}
        prompt={<p>{riddle.body}</p>}
        hint={t("riddleTextOnly")}
      />
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

  let status = "";
  if (pending) status = t("riddleChecking");
  else if (mounted && waiting && seconds > 0) {
    status = wrongId != null
      ? t("riddleWrong", { seconds })
      : t("riddleLocked", { seconds });
  } else if (failed) {
    status = t("riddleError");
  }

  return (
    <TestTaskCard
      heading="h3"
      titleId={titleId}
      title={riddle.title}
      badge={t("riddlesTitle")}
      prompt={<p>{riddle.body}</p>}
      hint={
        solved && hint ? (
          <span>
            <span className={css.fieldLabel}>{t("riddleExplanation")}. </span>
            {hint}
          </span>
        ) : !solved && status ? (
          <span role="status" aria-live="polite">{status}</span>
        ) : undefined
      }
      result={solved ? t("riddleCorrect") : undefined}
    >
      <div role="group" aria-labelledby={titleId} className={cardCss.answers}>
        {riddle.options.map((option, index) => {
          const right = solved && option.id === choiceId;
          const wrong = !solved && option.id === wrongId && waiting;
          const className = [
            cardCss.option,
            right ? cardCss.optionCorrect : "",
            wrong ? cardCss.optionWrong : "",
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
              <span className={cardCss.mark}>{optionLetter(index)})</span>
              <span className={cardCss.optionText}>{option.label}</span>
            </button>
          );
        })}
      </div>
    </TestTaskCard>
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
