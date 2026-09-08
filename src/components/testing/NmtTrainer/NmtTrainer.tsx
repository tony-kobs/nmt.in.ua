"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  checkAnswerAction,
  finishTrainerSessionAction,
} from "@/modules/testing/actions";

import type {
  SessionTask,
  TrainerSessionSummary,
} from "@/modules/testing/types";
import { MathText } from "@/components/ui/MathText";

import styles from "./NmtTrainer.module.css";

const NMT_DURATION_SEC = 60 * 60;

type NmtTrainerProps = {
  sessionId: number;
  tasks: SessionTask[];
  initialSummary?: TrainerSessionSummary | null;
};

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds);

  const minutes = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function NmtTrainer({
  sessionId,
  tasks,
  initialSummary,
}: NmtTrainerProps) {
  const t = useTranslations("nmtTrainer");
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);

  const [answered, setAnswered] = useState<Record<number, number>>({});

  const [remainingSeconds, setRemainingSeconds] = useState(NMT_DURATION_SEC);

  const [isFinishing, setIsFinishing] = useState(false);

  const [error, setError] = useState<string | null>(null);

  /** State guards only take effect on the next render — two fast clicks would
   * otherwise both pass and fire the same Server Action twice. */
  const answeringRef = useRef(false);
  const finishingRef = useRef(false);

  const [pendingMappingId, setPendingMappingId] = useState<number | null>(null);

  const currentTask = tasks[currentIndex];

  const answeredCount = Object.keys(answered).length;

  const isFinished = Boolean(initialSummary) || tasks.length === 0;

  const finish = useCallback(async () => {
    if (isFinishing || isFinished || finishingRef.current) {
      return;
    }
    finishingRef.current = true;

    setIsFinishing(true);
    setError(null);

    const result = await finishTrainerSessionAction({
      sessionId,
      markUnansweredAsIncorrect: true,
      capTimeSec: NMT_DURATION_SEC,
    });

    if (result.status === "error") {
      finishingRef.current = false;
      setError(result.code);
      setIsFinishing(false);
      return;
    }

    router.push(`/results?sessionId=${sessionId}`);
  }, [isFinishing, isFinished, router, sessionId]);

  const finishRef = useRef(finish);

  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  useEffect(() => {
    if (isFinished) {
      return;
    }

    let remaining = NMT_DURATION_SEC;

    const timer = window.setInterval(() => {
      remaining -= 1;
      setRemainingSeconds(remaining);

      if (remaining <= 0) {
        window.clearInterval(timer);
        void finishRef.current();
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isFinished]);

  const isTimeOver = remainingSeconds <= 0;

  async function handleAnswer(answerNumber: 1 | 2 | 3 | 4) {
    if (!currentTask || isFinishing || isTimeOver || answeringRef.current) {
      return;
    }

    if (answered[currentTask.mappingId]) {
      return;
    }

    answeringRef.current = true;
    setError(null);
    setPendingMappingId(currentTask.mappingId);

    let result: Awaited<ReturnType<typeof checkAnswerAction>>;
    try {
      result = await checkAnswerAction({
        sessionId,
        mappingId: currentTask.mappingId,
        answerNumber,
      });
    } finally {
      answeringRef.current = false;
      setPendingMappingId(null);
    }

    if (result.status === "error") {
      setError(result.code);
      return;
    }

    setAnswered((previous) => ({
      ...previous,
      [currentTask.mappingId]: answerNumber,
    }));
  }

  function goTo(index: number) {
    if (index < 0 || index >= tasks.length) {
      return;
    }

    setCurrentIndex(index);
  }

  if (!currentTask) {
    return null;
  }

  const selectedAnswer = answered[currentTask.mappingId];

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <p className={styles.label}>{t("title")}</p>

          <h1>
            {t("taskProgress", {
              current: currentIndex + 1,
              total: tasks.length,
            })}
          </h1>
        </div>

        <div className={styles.timer}>{formatTime(remainingSeconds)}</div>
      </header>

      <div className={styles.progress}>
        <div
          className={styles.progressBar}
          style={{
            width: `${(answeredCount / tasks.length) * 100}%`,
          }}
        />
      </div>

      <div className={styles.content}>
        <div className={styles.task}>
          <p className={styles.taskName}>{currentTask.name}</p>

          <MathText
            as="div"
            className={styles.taskText}
            text={currentTask.taskText}
          />

          <div className={styles.answers}>
            {currentTask.answers.map((answer) => {
              const isSelected = selectedAnswer === answer.number;

              return (
                <button
                  key={answer.number}
                  type="button"
                  className={`${styles.answer} ${
                    isSelected ? styles.selected : ""
                  }`}
                  disabled={
                    Boolean(selectedAnswer) ||
                    pendingMappingId === currentTask.mappingId
                  }
                  onClick={() => handleAnswer(answer.number)}
                >
                  <span className={styles.answerNumber}>{answer.number}</span>

                  <MathText text={answer.text} />
                </button>
              );
            })}
          </div>
        </div>

        <aside className={styles.navigation}>
          <h2>{t("tasks")}</h2>

          <div className={styles.grid}>
            {tasks.map((task, index) => {
              const isAnswered = Boolean(answered[task.mappingId]);

              return (
                <button
                  key={task.mappingId}
                  type="button"
                  className={`${styles.questionButton} ${
                    index === currentIndex ? styles.current : ""
                  } ${isAnswered ? styles.answered : ""}`}
                  onClick={() => goTo(index)}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>

          <p className={styles.counter}>
            {t("answered", {
              answered: answeredCount,
              total: tasks.length,
            })}
          </p>

          <button
            type="button"
            className={styles.finishButton}
            onClick={() => void finish()}
            disabled={isFinishing}
          >
            {isFinishing ? t("finishing") : t("finishTest")}
          </button>
        </aside>
      </div>

      <footer className={styles.footer}>
        <button
          type="button"
          onClick={() => goTo(currentIndex - 1)}
          disabled={currentIndex === 0}
        >
          ← {t("back")}
        </button>

        <button
          type="button"
          onClick={() => goTo(currentIndex + 1)}
          disabled={currentIndex === tasks.length - 1}
        >
          {t("next")} →
        </button>
      </footer>

      {error && <p className={styles.error}>{t(`errors.${error}`)}</p>}
    </section>
  );
}
