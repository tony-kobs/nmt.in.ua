"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/Select/Select";
import { MathText } from "@/components/ui/MathText";
import { addDayBankTasksAction, searchDayBankAction } from "@/modules/marathons/daily/actions";
import {
  BANK_SEARCH_DEBOUNCE_MS,
  bankSearchPages,
  beginBankSearch,
  isLatestBankRequest,
  normalizeBankSearchText,
  type BankSearchState,
} from "@/modules/marathons/daily/bankSearchText";
import { DAY_BLOCK_MAX } from "@/modules/marathons/daily/dayRemoval";
import { SubmitButton } from "../ConfirmSubmit";
import css from "../marathon.module.css";

export type BankThemeOption = {
  id: number;
  code: string;
  name: string;
  count: number;
};

export type BankChoice = {
  id: number;
  prompt: string;
  options: string[];
  themeName?: string;
};

type Hit = BankChoice & { difficulty?: number; otherDays?: number[] };

export function DayTaskBank({
  marathonId,
  dayId,
  subject,
  themes,
  saved,
  submissions,
}: {
  marathonId: number;
  dayId: number;
  subject: string;
  themes: BankThemeOption[];
  saved: BankChoice[];
  submissions: number;
}) {
  const t = useTranslations("Marathon");
  const titleId = useId();
  const searchId = useId();
  const subjectLabel = useId();
  const themeLabel = useId();
  const difficultyLabel = useId();
  const typeLabel = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef(0);
  const initialSearch: BankSearchState = {
    query: "",
    page: 1,
    themeId: "",
    difficulty: "0",
    optionCount: 0,
    subject: subject.trim().toLowerCase() === "math" ? "math" : subject.trim() || "math",
    request: 0,
  };
  const stateRef = useRef(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [hits, setHits] = useState<Hit[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [picked, setPicked] = useState<Map<number, Hit>>(() => new Map());

  const subjectOptions = useMemo(() => {
    const values = ["math"];
    const own = subject.trim().toLowerCase();
    if (own && own !== "math") values.unshift(own);
    return values.map((value) => ({ value, label: value }));
  }, [subject]);

  const themeOptions = useMemo(
    () => [
      { value: "", label: t("bankAllThemes") },
      ...themes.map((theme) => ({
        value: String(theme.id),
        label: t("bankThemeOption", { name: theme.name, count: theme.count }),
      })),
    ],
    [themes, t],
  );

  const onDay = useMemo(() => new Set(saved.map((item) => item.id)), [saved]);
  const room = Math.max(0, DAY_BLOCK_MAX - saved.length);
  const chosen = [...picked.values()].filter((item) => !onDay.has(item.id)).slice(0, room);
  const pages = bankSearchPages(total, pageSize);

  function apply(next: BankSearchState, delay: number) {
    stateRef.current = next;
    latestRef.current = next.request;
    setSearch(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    const issued = next.request;
    const fire = () => {
      const ready =
        next.themeId !== "" ||
        next.difficulty !== "0" ||
        next.optionCount !== 0 ||
        normalizeBankSearchText(next.query).length > 0;
      if (!ready) {
        if (!isLatestBankRequest(latestRef.current, issued)) return;
        setHits([]);
        setTotal(0);
        setPending(false);
        setNote(t("bankHint"));
        return;
      }
      setPending(true);
      setNote(null);
      void searchDayBankAction({
        marathonId,
        dayId,
        subject: next.subject,
        themeId: next.themeId ? Number(next.themeId) : null,
        query: next.query,
        difficulty: Number(next.difficulty) || null,
        optionCount: next.optionCount,
        page: next.page,
      })
        .then((result) => {
          if (!isLatestBankRequest(latestRef.current, issued)) return;
          if (!result.ok) {
            setHits([]);
            setTotal(0);
            if (result.error === "subject") setNote(t("bankSubjectEmpty"));
            else if (result.error === "narrow") setNote(t("bankHint"));
            else if (result.error === "empty") setNote(t("bankEmptySearch"));
            else setNote(t("errors.server"));
            return;
          }
          setHits(result.tasks);
          setTotal(result.total);
          setPageSize(result.pageSize);
          if (result.page !== next.page) {
            const synced = { ...stateRef.current, page: result.page };
            stateRef.current = synced;
            setSearch(synced);
          }
        })
        .catch(() => {
          if (!isLatestBankRequest(latestRef.current, issued)) return;
          setHits([]);
          setTotal(0);
          setNote(t("errors.server"));
        })
        .finally(() => {
          if (isLatestBankRequest(latestRef.current, issued)) setPending(false);
        });
    };
    if (delay <= 0) fire();
    else timerRef.current = setTimeout(fire, delay);
  }

  function change(patch: Partial<Omit<BankSearchState, "request">>, delay: number) {
    apply(beginBankSearch(stateRef.current, patch), delay);
  }

  function toggle(hit: Hit) {
    if (picked.has(hit.id)) {
      const next = new Map(picked);
      next.delete(hit.id);
      setPicked(next);
      return;
    }
    if (picked.size >= room) {
      setNote(t("bankLimit", { max: DAY_BLOCK_MAX }));
      return;
    }
    const next = new Map(picked);
    next.set(hit.id, hit);
    setPicked(next);
  }

  return (
    <div>
      {submissions > 0 ? <p className={css.meta}>{t("bankLocked")}</p> : (
        <button
          ref={openerRef}
          type="button"
          className={css.button}
          onClick={() => {
            dialogRef.current?.showModal();
            searchRef.current?.focus();
          }}
        >
          {t("bankAddButton")}
        </button>
      )}
      <dialog
        ref={dialogRef}
        className={css.pickerDialog}
        aria-labelledby={titleId}
        aria-busy={pending || undefined}
        onClose={() => openerRef.current?.focus()}
      >
        <h3 id={titleId}>{t("bankAddButton")}</h3>
        <p className={css.meta}>{t("bankSubjectMath")}</p>
        <div className={css.row2}>
          <div className={css.field}>
            <span className={css.fieldLabel} id={subjectLabel}>{t("bankSubject")}</span>
            <Select
              aria-labelledby={subjectLabel}
              options={subjectOptions}
              value={search.subject}
              onChange={(value) => change({ subject: value }, 0)}
            />
          </div>
          <div className={css.field}>
            <span className={css.fieldLabel} id={themeLabel}>{t("bankTheme")}</span>
            <Select
              aria-labelledby={themeLabel}
              options={themeOptions}
              value={search.themeId}
              onChange={(value) => change({ themeId: value }, 0)}
              placeholder={t("bankAllThemes")}
            />
          </div>
        </div>
        <div className={css.row2}>
          <div className={css.field}>
            <span className={css.fieldLabel} id={difficultyLabel}>{t("bankDifficulty")}</span>
            <Select
              aria-labelledby={difficultyLabel}
              options={[
                { value: "0", label: t("bankDifficultyAll") },
                ...[1, 2, 3, 4, 5].map((level) => ({ value: String(level), label: String(level) })),
              ]}
              value={search.difficulty}
              onChange={(value) => change({ difficulty: value }, 0)}
            />
          </div>
          <div className={css.field}>
            <span className={css.fieldLabel} id={typeLabel}>{t("bankType")}</span>
            <Select
              aria-labelledby={typeLabel}
              options={[
                { value: "0", label: t("bankTypeAll") },
                { value: "2", label: t("bankTypeTwo") },
                { value: "4", label: t("bankTypeFour") },
              ]}
              value={String(search.optionCount)}
              onChange={(value) => change({ optionCount: Number(value) as 0 | 2 | 4 }, 0)}
            />
          </div>
        </div>
        <div className={css.field}>
          <label className={css.fieldLabel} htmlFor={searchId}>{t("bankSearch")}</label>
          <input
            ref={searchRef}
            id={searchId}
            className={css.input}
            value={search.query}
            onChange={(event) => change({ query: event.target.value }, BANK_SEARCH_DEBOUNCE_MS)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                change({ query: event.currentTarget.value, page: 1 }, 0);
              }
            }}
            autoComplete="off"
            enterKeyHint="search"
            aria-describedby={note ? `${searchId}-note` : undefined}
          />
        </div>
        <p className={css.pickerStatus} aria-live="polite">
          {pending ? t("bankSearching") : t("bankSelected", { count: picked.size })}
        </p>
        {note ? (
          <p id={`${searchId}-note`} className={css.fieldError} role="alert">
            {note}
          </p>
        ) : null}
        {hits.length > 0 ? (
          <ul className={css.taskList}>
            {hits.map((hit) => {
              const added = onDay.has(hit.id);
              const on = picked.has(hit.id);
              return (
                <li key={hit.id} className={css.taskRow}>
                  <label className={css.pickerCheck}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={added}
                      onChange={() => toggle(hit)}
                    />
                    <span>
                      #{hit.id}
                      {hit.themeName ? ` · ${hit.themeName}` : ""}
                      {hit.difficulty ? ` · ${t("bankDifficulty")} ${hit.difficulty}` : ""}
                      {added ? ` · ${t("bankPicked")}` : ""}
                    </span>
                  </label>
                  {hit.otherDays && hit.otherDays.length > 0 ? (
                    <p className={css.fieldError}>{t("bankOtherDay", { days: hit.otherDays.join(", ") })}</p>
                  ) : null}
                  <div className={css.pickerPrompt}>
                    <MathText text={hit.prompt} as="div" />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
        {total > pageSize ? (
          <div className={css.actions}>
            <button
              type="button"
              className={css.buttonQuiet}
              disabled={search.page <= 1 || pending}
              onClick={() => change({ page: search.page - 1 }, 0)}
            >
              {t("bankPrev")}
            </button>
            <p className={css.meta}>{t("bankPage", { page: search.page, pages })}</p>
            <button
              type="button"
              className={css.buttonQuiet}
              disabled={search.page >= pages || pending}
              onClick={() => change({ page: search.page + 1 }, 0)}
            >
              {t("bankNext")}
            </button>
          </div>
        ) : null}
        <form action={addDayBankTasksAction}>
          <input type="hidden" name="marathonId" value={marathonId} />
          <input type="hidden" name="dayId" value={dayId} />
          {chosen.map((hit) => (
            <input key={hit.id} type="hidden" name="questionId" value={hit.id} />
          ))}
          <div className={css.actions}>
            <SubmitButton className={css.button} pendingLabel={t("saving")} disabled={chosen.length === 0}>
              {t("bankAddSelected")}
            </SubmitButton>
            <button type="button" className={css.buttonQuiet} onClick={() => dialogRef.current?.close()}>
              {t("bankClose")}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
