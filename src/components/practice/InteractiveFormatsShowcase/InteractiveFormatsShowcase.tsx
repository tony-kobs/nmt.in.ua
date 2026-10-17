"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { OrderTaskCard } from "@/components/practice/OrderTaskCard";
import { FindErrorTaskCard } from "@/components/practice/FindErrorTaskCard";
import { GraphTaskCard } from "@/components/practice/GraphTaskCard";
import { MatchingTaskCard } from "@/components/practice/MatchingTaskCard";
import { BlankTaskCard } from "@/components/practice/BlankTaskCard";
import { startRoundAction, finishRoundAction } from "@/modules/stage2/roundActions";
import type { RoundSnapshot, RoundTask } from "@/modules/stage2/rounds";
import type { Stage2Format } from "@/modules/stage2/stage2Attempt";
import { TOPIC_TEST_TASK_COUNT } from "@/modules/testing/topicTestMode";
import css from "./InteractiveFormatsShowcase.module.css";

const FORMAT_KEYS = {
  order: "formatOrder",
  find_error: "formatFindError",
  graph: "formatGraph",
  matching: "formatMatching",
  blank: "formatBlank",
} as const;

function suggestedCount(bankSize: number): number {
  if (bankSize <= 0) return 1;
  return Math.min(TOPIC_TEST_TASK_COUNT, bankSize);
}

export function InteractiveFormatsShowcase({
  embedded = false,
  bankSize = 0,
}: {
  embedded?: boolean;
  bankSize?: number;
} = {}) {
  const t = useTranslations("Stage2");
  const [round, setRound] = useState<RoundSnapshot | null>(null);
  const [phase, setPhase] = useState<"intro" | "play" | "review">("intro");
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [emptyCatalog, setEmptyCatalog] = useState(false);
  const [taskCountInput, setTaskCountInput] = useState(() => String(suggestedCount(bankSize)));
  const parsedCount = Number(taskCountInput);
  if (bankSize > 0 && Number.isInteger(parsedCount) && parsedCount > bankSize) {
    setTaskCountInput(String(bankSize));
  }
  const countValid =
    Number.isInteger(parsedCount) && parsedCount >= 1 && parsedCount <= bankSize;

  async function begin() {
    if (busy || !countValid) return;
    setBusy(true);
    setError(false);
    setEmptyCatalog(false);
    try {
      const result = await startRoundAction("diagnostic", parsedCount);
      if (result.status !== "success") {
        if (result.code === "not_eligible") setEmptyCatalog(true);
        else setError(true);
        return;
      }
      const open = result.round.tasks.findIndex((task) => !task.answered && !task.skipped);
      setRound(result.round);
      if (result.round.completed || open === -1) {
        if (!result.round.completed) {
          const finished = await finishRoundAction(result.round.id);
          if (finished.status !== "success") {
            setError(true);
            return;
          }
          setRound(finished.round);
        }
        setPhase("review");
        return;
      }
      setIndex(open);
      setPhase("play");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function finish(current: RoundSnapshot) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const result = await finishRoundAction(current.id);
      if (result.status !== "success") {
        setError(true);
        return;
      }
      setRound(result.round);
      setPhase("review");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  function onAnswered() {
    if (!round) return;
    if (index < round.tasks.length - 1) {
      setIndex((value) => value + 1);
      return;
    }
    void finish(round);
  }

  const task = phase === "play" ? round?.tasks[index] : undefined;
  const mistakes = round?.tasks.filter((item) => item.firstCorrect !== true) ?? [];
  const labels = (format: Stage2Format) => t(FORMAT_KEYS[format]);

  const startBar = (label: string) => (
    <div className={css.startBlock}>
      <div className={css.startRow}>
        <div className={css.countField}>
          <label className={css.countLabel} htmlFor="interactive-task-count">
            {t("tasks")}
          </label>
          <div className={css.countWrap}>
            <input
              id="interactive-task-count"
              className={css.countInput}
              type="number"
              inputMode="numeric"
              min={1}
              max={Math.max(bankSize, 1)}
              step={1}
              value={taskCountInput}
              onChange={(event) => setTaskCountInput(event.currentTarget.value)}
              disabled={busy || bankSize === 0}
              aria-describedby="interactive-task-count-hint"
              aria-label={t("taskCountAria", {
                count: countValid ? parsedCount : 0,
                total: bankSize,
              })}
              autoComplete="off"
            />
            <span className={css.countBank} aria-hidden>
              <span className={css.countSlash}>/</span>
              <span className={css.countTotal}>{bankSize}</span>
            </span>
          </div>
        </div>
        <button
          type="button"
          className={css.primary}
          disabled={busy || !countValid}
          onClick={() => void begin()}
        >
          {label}
        </button>
      </div>
      <span className={css.hint} id="interactive-task-count-hint">
        {t("tasksHint", { total: bankSize })}
      </span>
    </div>
  );

  return (
    <div className={embedded ? css.embeddedFrame : css.frame}>
      {embedded ? <h2 className={css.title}>{t("pageTitle")}</h2> : <h1 className={css.title}>{t("pageTitle")}</h1>}
      <p className={css.lead}>{t("roundLead")}</p>
      {emptyCatalog ? <p role="alert">{t("catalogEmpty")}</p> : null}
      {error ? <p role="alert">{t("checkError")}</p> : null}

      {phase === "intro" ? <div className={css.intro}>{startBar(t("startTest"))}</div> : null}

      {phase === "play" && round && task ? (
        <div className={css.play}>
          <p className={css.progress}>{t("progress", { current: index + 1, total: round.tasks.length })}</p>
          <fieldset className={css.card} disabled={busy} key={`${round.id}-${task.position}`}>
            <legend className={css.cardLegend}>{labels(task.format)}</legend>
            <TaskCard
              task={task}
              roundId={round.id}
              quiet
              submitLabel={index === round.tasks.length - 1 ? t("finishTest") : t("nextTask")}
              onAnswered={onAnswered}
            />
          </fieldset>
          {error ? (
            <button type="button" className={css.primary} disabled={busy} onClick={() => void finish(round)}>
              {t("finishTest")}
            </button>
          ) : null}
        </div>
      ) : null}

      {phase === "review" && round ? (
        <div className={css.review}>
          <h3 className={css.reviewTitle}>{t("reviewTitle")}</h3>
          <p role="status">{t("roundScore", { correct: round.firstCorrectCount ?? 0, total: round.tasks.length })}</p>
          {mistakes.length === 0 ? <p>{t("reviewAllRight")}</p> : null}
          {mistakes.map((item) => (
            <fieldset key={item.position} className={css.card}>
              <legend className={css.cardLegend}>{labels(item.format)}</legend>
              <TaskCard task={item} roundId={round.id} />
            </fieldset>
          ))}
          {startBar(t("again"))}
        </div>
      ) : null}
    </div>
  );
}

function TaskCard({
  task,
  roundId,
  quiet = false,
  submitLabel,
  onAnswered,
}: {
  task: RoundTask;
  roundId: number;
  quiet?: boolean;
  submitLabel?: string;
  onAnswered?: () => void;
}) {
  const props = { taskId: task.taskId, roundId, quiet, submitLabel, onAnswered, diagnostic: quiet };
  if (task.format === "order") return <OrderTaskCard {...props} />;
  if (task.format === "find_error") return <FindErrorTaskCard {...props} />;
  if (task.format === "graph") return <GraphTaskCard {...props} />;
  if (task.format === "matching") return <MatchingTaskCard {...props} />;
  return <BlankTaskCard {...props} />;
}
