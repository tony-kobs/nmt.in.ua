"use client";

import { guardConfirmedSubmit } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { Select } from "@/components/ui/Select";
import {
  createThemeLevelAction,
  deleteThemeLevelAction,
  moveThemeLevelAction,
  updateThemeLevelAction,
  type ThemeLevelActionState,
} from "@/modules/admin-content/actions";
import type {
  ThemeLevel,
  ThemeParam,
  ThemeTaskMark,
} from "@/modules/admin-content/types";
import { MAX_THEME_LEVEL_NAME } from "@/modules/admin-content/types";
import {
  countMatchingTasks,
  rulesFromDraft,
  type LevelRuleDraft,
  type ThemeLevelRule,
} from "@/modules/testing/themeLevelMatch";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import css from "./AdminContentEditor.module.css";

const IDLE: ThemeLevelActionState = { status: "idle" };

function ChevronIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={direction === "up" ? "m6 14 6-6 6 6" : "m6 10 6 6 6-6"}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.5 19.5 5.6 15 15.2 5.4a1.6 1.6 0 0 1 2.3 0l1.1 1.1a1.6 1.6 0 0 1 0 2.3L9 18.4 4.5 19.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="m13.8 6.8 3.4 3.4" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7.5h14M9.5 7.4V5.8A1.3 1.3 0 0 1 10.8 4.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.6M8 7.5l.7 11.2a1.3 1.3 0 0 0 1.3 1.2h3.9a1.3 1.3 0 0 0 1.3-1.2L16 7.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function blankDrafts(params: readonly ThemeParam[]): LevelRuleDraft[] {
  return params.map((param) => ({
    paramId: param.id,
    enabled: false,
    boolValue: 1,
    intMin: "",
    intMax: "",
  }));
}

function draftsFromLevel(
  params: readonly ThemeParam[],
  level: ThemeLevel,
): LevelRuleDraft[] {
  return params.map((param) => {
    const rule = level.rules.find((item) => item.paramId === param.id);
    return {
      paramId: param.id,
      enabled: rule != null,
      boolValue: rule?.boolValue === 0 ? 0 : 1,
      intMin: rule?.intMin != null ? String(rule.intMin) : "",
      intMax: rule?.intMax != null ? String(rule.intMax) : "",
    };
  });
}

function LevelCount({
  params,
  drafts,
  taskIds,
  marks,
}: {
  params: readonly ThemeParam[];
  drafts: readonly LevelRuleDraft[];
  taskIds: readonly number[];
  marks: readonly ThemeTaskMark[];
}) {
  const t = useTranslations("AdminContent");
  const compiled = rulesFromDraft(params, drafts);
  if (compiled.rules.length === 0 && !compiled.incomplete) {
    return <p className={css.levelCount}>{t("levelPickRule")}</p>;
  }
  if (compiled.incomplete || compiled.rules.length === 0) {
    return <p className={css.levelCount}>{t("levelCountPending")}</p>;
  }
  const count = countMatchingTasks(taskIds, marks, compiled.rules);
  if (count === 0) {
    return (
      <p className={clsx(css.alert, css.alertError)} role="status">
        {t("levelCountNone")}
      </p>
    );
  }
  return (
    <p className={css.levelCount} role="status">
      {t("levelCount", { count })}
    </p>
  );
}

function RuleFields({
  params,
  drafts,
  disabled,
  onChange,
}: {
  params: readonly ThemeParam[];
  drafts: readonly LevelRuleDraft[];
  disabled: boolean;
  onChange: (next: LevelRuleDraft[]) => void;
}) {
  const t = useTranslations("AdminContent");
  function patch(paramId: number, update: Partial<LevelRuleDraft>) {
    onChange(
      drafts.map((draft) =>
        draft.paramId === paramId ? { ...draft, ...update } : draft,
      ),
    );
  }

  return (
    <div className={css.levelRules}>
      {params.map((param) => {
        const draft = drafts.find((item) => item.paramId === param.id);
        if (!draft) return null;
        return (
          <div key={param.id} className={css.levelRule}>
            <label className={css.levelRuleHead}>
              <input
                className={css.levelCheck}
                type="checkbox"
                name={`rule.${param.id}.on`}
                value="1"
                checked={draft.enabled}
                disabled={disabled}
                onChange={(event) =>
                  patch(param.id, { enabled: event.currentTarget.checked })
                }
              />
              <span>{param.name}</span>
            </label>
            {draft.enabled && param.valueType === "bool" ? (
              <Select
                name={`rule.${param.id}.bool`}
                value={String(draft.boolValue)}
                disabled={disabled}
                aria-label={t("levelBoolAria", { name: param.name })}
                options={[
                  { value: "1", label: t("levelYes") },
                  { value: "0", label: t("levelNo") },
                ]}
                onChange={(next) =>
                  patch(param.id, { boolValue: next === "0" ? 0 : 1 })
                }
              />
            ) : null}
            {draft.enabled && param.valueType === "int" ? (
              <div className={css.levelRange}>
                <label className={css.fieldStack}>
                  <span className={css.themeLabel}>{t("levelFrom")}</span>
                  <input
                    className={css.input}
                    name={`rule.${param.id}.min`}
                    inputMode="numeric"
                    min={0}
                    value={draft.intMin}
                    disabled={disabled}
                    autoComplete="off"
                    aria-label={t("levelFromAria", { name: param.name })}
                    onChange={(event) =>
                      patch(param.id, { intMin: event.currentTarget.value })
                    }
                  />
                </label>
                <label className={css.fieldStack}>
                  <span className={css.themeLabel}>{t("levelTo")}</span>
                  <input
                    className={css.input}
                    name={`rule.${param.id}.max`}
                    inputMode="numeric"
                    min={0}
                    value={draft.intMax}
                    disabled={disabled}
                    autoComplete="off"
                    aria-label={t("levelToAria", { name: param.name })}
                    onChange={(event) =>
                      patch(param.id, { intMax: event.currentTarget.value })
                    }
                  />
                </label>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ruleSummary(
  level: ThemeLevel,
  params: readonly ThemeParam[],
  yes: string,
  no: string,
): string {
  return level.rules
    .map((rule: ThemeLevelRule) => {
      const param = params.find((item) => item.id === rule.paramId);
      const name = param?.name ?? String(rule.paramId);
      if (rule.valueType === "bool") {
        return `${name}: ${rule.boolValue === 1 ? yes : no}`;
      }
      return `${name}: ${rule.intMin}–${rule.intMax}`;
    })
    .join(" · ");
}

export function ThemeLevelsPanel({
  themeId,
  params,
  levels,
  taskIds,
  marks,
}: {
  themeId: number;
  params: ThemeParam[];
  levels: ThemeLevel[];
  taskIds: number[];
  marks: ThemeTaskMark[];
}) {
  const t = useTranslations("AdminContent");
  const router = useRouter();
  const [name, setName] = useState("");
  const [drafts, setDrafts] = useState<LevelRuleDraft[]>(() => blankDrafts(params));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDrafts, setEditDrafts] = useState<LevelRuleDraft[]>([]);
  const paramKey = params.map((param) => `${param.id}:${param.valueType}`).join(",");
  const [seenParams, setSeenParams] = useState(paramKey);
  if (seenParams !== paramKey) {
    setSeenParams(paramKey);
    setDrafts(blankDrafts(params));
    if (editingId != null) {
      const level = levels.find((item) => item.id === editingId);
      setEditDrafts(level ? draftsFromLevel(params, level) : blankDrafts(params));
    }
  }
  const [createError, setCreateError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [createPending, startCreate] = useTransition();
  const [updatePending, startUpdate] = useTransition();
  const [movePending, startMove] = useTransition();
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteThemeLevelAction,
    IDLE,
  );
  const busy = createPending || updatePending || deletePending || movePending;

  useEffect(() => {
    if (deleteState.status !== "success") return;
    router.refresh();
  }, [deleteState, router]);

  const savedCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const level of levels) {
      counts.set(level.id, countMatchingTasks(taskIds, marks, level.rules));
    }
    return counts;
  }, [levels, taskIds, marks]);

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setCreateError(null);
    setCreated(false);
    startCreate(async () => {
      const result = await createThemeLevelAction(IDLE, data);
      if (result.status === "error") {
        setCreateError(result.code);
        return;
      }
      setName("");
      setDrafts(blankDrafts(params));
      setCreated(true);
      router.refresh();
    });
  }

  function submitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setUpdateError(null);
    setUpdated(false);
    startUpdate(async () => {
      const result = await updateThemeLevelAction(IDLE, data);
      if (result.status === "error") {
        setUpdateError(result.code);
        return;
      }
      setEditingId(null);
      setUpdated(true);
      router.refresh();
    });
  }

  function move(levelId: number, direction: "up" | "down") {
    setMoveError(null);
    startMove(async () => {
      const result = await moveThemeLevelAction(themeId, levelId, direction);
      if (result.status === "error") {
        setMoveError(result.code);
        return;
      }
      router.refresh();
    });
  }

  const errorCode =
    createError ??
    updateError ??
    (deleteState.status === "error" ? deleteState.code : null) ??
    moveError;

  return (
    <div className={css.paramsBlock}>
      <h3 id={`theme-levels-${themeId}`} className={css.panelTitle}>
        {t("levelsTitle")}
      </h3>
      <p className={css.panelLead}>{t("levelsLead")}</p>

      {errorCode ? (
        <p className={clsx(css.alert, css.alertError)} role="alert">
          {t(`errors.${errorCode}`)}
        </p>
      ) : null}
      {created ? (
        <p className={clsx(css.alert, css.alertSuccess)} role="status">
          {t("levelAdded")}
        </p>
      ) : null}
      {updated ? (
        <p className={clsx(css.alert, css.alertSuccess)} role="status">
          {t("levelUpdated")}
        </p>
      ) : null}
      {deleteState.status === "success" ? (
        <p className={clsx(css.alert, css.alertSuccess)} role="status">
          {t("levelDeleted")}
        </p>
      ) : null}

      {levels.length === 0 ? (
        <p className={css.empty}>{t("levelsEmpty")}</p>
      ) : (
        <ol className={css.paramList}>
          {levels.map((level, index) =>
            editingId === level.id ? (
              <li key={level.id} className={css.paramRow}>
                <form onSubmit={submitUpdate} className={css.paramForm}>
                  <input type="hidden" name="themeId" value={themeId} />
                  <input type="hidden" name="levelId" value={level.id} />
                  <label className={css.fieldStack}>
                    <span className={css.themeLabel}>{t("levelName")}</span>
                    <input
                      className={css.input}
                      name="name"
                      value={editName}
                      maxLength={MAX_THEME_LEVEL_NAME}
                      required
                      disabled={busy}
                      onChange={(event) => setEditName(event.currentTarget.value)}
                    />
                  </label>
                  <RuleFields
                    params={params}
                    drafts={editDrafts}
                    disabled={busy}
                    onChange={setEditDrafts}
                  />
                  <LevelCount
                    params={params}
                    drafts={editDrafts}
                    taskIds={taskIds}
                    marks={marks}
                  />
                  <div className={css.paramEditActions}>
                    <button type="submit" className={css.saveBtn} disabled={busy}>
                      {t("levelSave")}
                    </button>
                    <button
                      type="button"
                      className={css.cancelBtn}
                      disabled={busy}
                      onClick={() => setEditingId(null)}
                    >
                      {t("levelCancel")}
                    </button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={level.id} className={css.paramRow}>
                <div className={css.paramMain}>
                  <p className={css.paramName}>{level.name}</p>
                  <p className={css.paramMeta}>
                    {ruleSummary(level, params, t("levelYes"), t("levelNo"))}
                  </p>
                  <p className={css.levelCount}>
                    {(savedCounts.get(level.id) ?? 0) === 0
                      ? t("levelCountNone")
                      : t("levelCount", { count: savedCounts.get(level.id) ?? 0 })}
                  </p>
                </div>
                <div className={css.paramActions}>
                  <button
                    type="button"
                    className={css.paramIcon}
                    aria-label={t("levelMoveUpAria", { name: level.name })}
                    disabled={busy || index === 0}
                    onClick={() => move(level.id, "up")}
                  >
                    <ChevronIcon direction="up" />
                  </button>
                  <button
                    type="button"
                    className={css.paramIcon}
                    aria-label={t("levelMoveDownAria", { name: level.name })}
                    disabled={busy || index === levels.length - 1}
                    onClick={() => move(level.id, "down")}
                  >
                    <ChevronIcon direction="down" />
                  </button>
                  <button
                    type="button"
                    className={css.paramIcon}
                    aria-label={t("levelEditAria", { name: level.name })}
                    disabled={busy}
                    onClick={() => {
                      setEditingId(level.id);
                      setEditName(level.name);
                      setEditDrafts(draftsFromLevel(params, level));
                      setUpdateError(null);
                    }}
                  >
                    <PencilIcon />
                  </button>
                  <form
                    action={deleteAction}
                    onSubmit={(event) => {
                      guardConfirmedSubmit(
                        event,
                        t("levelDeleteConfirm", { name: level.name }),
                      );
                    }}
                  >
                    <input type="hidden" name="themeId" value={themeId} />
                    <input type="hidden" name="levelId" value={level.id} />
                    <button
                      type="submit"
                      className={clsx(css.paramIcon, css.paramDelete)}
                      aria-label={t("levelDeleteAria", { name: level.name })}
                      disabled={busy}
                    >
                      <TrashIcon />
                    </button>
                  </form>
                </div>
              </li>
            ),
          )}
        </ol>
      )}

      {params.length === 0 ? (
        <p className={css.empty}>{t("levelsNeedParams")}</p>
      ) : (
        <form onSubmit={submitCreate} className={css.paramForm}>
          <input type="hidden" name="themeId" value={themeId} />
          <label className={css.fieldStack}>
            <span className={css.themeLabel}>{t("levelName")}</span>
            <input
              className={css.input}
              name="name"
              value={name}
              maxLength={MAX_THEME_LEVEL_NAME}
              required
              disabled={busy}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </label>
          <RuleFields
            params={params}
            drafts={drafts}
            disabled={busy}
            onChange={setDrafts}
          />
          <LevelCount
            params={params}
            drafts={drafts}
            taskIds={taskIds}
            marks={marks}
          />
          <button type="submit" className={css.saveBtn} disabled={busy}>
            {createPending ? t("levelAdding") : t("levelAdd")}
          </button>
        </form>
      )}
    </div>
  );
}
