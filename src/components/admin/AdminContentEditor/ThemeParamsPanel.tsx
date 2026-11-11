"use client";

import { guardConfirmedSubmit } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { Select } from "@/components/ui/Select";
import {
  createThemeParamAction,
  deleteThemeParamAction,
  moveThemeParamAction,
  updateThemeParamAction,
  type ThemeParamActionState,
} from "@/modules/admin-content/actions";
import type { ThemeParam, ThemeParamValueType } from "@/modules/admin-content/types";
import {
  MAX_THEME_PARAM_CODE,
  MAX_THEME_PARAM_NAME,
} from "@/modules/admin-content/types";
import { suggestParamCode, uniqueParamCode } from "@/modules/admin-content/validate";
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

const IDLE: ThemeParamActionState = { status: "idle" };

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

function statusCode(state: ThemeParamActionState): string | null {
  return state.status === "error" ? state.code : null;
}

export function ThemeParamsPanel({
  themeId,
  params,
}: {
  themeId: number;
  params: ThemeParam[];
}) {
  const t = useTranslations("AdminContent");
  const router = useRouter();
  const taken = useMemo(() => new Set(params.map((param) => param.code)), [params]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [valueType, setValueType] = useState<ThemeParamValueType>("bool");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [movePending, startMove] = useTransition();
  const [createPending, startCreate] = useTransition();
  const [updatePending, startUpdate] = useTransition();

  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteThemeParamAction,
    IDLE,
  );
  const busy = createPending || updatePending || deletePending || movePending;

  useEffect(() => {
    if (deleteState.status !== "success") return;
    router.refresh();
  }, [deleteState, router]);

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setCreateError(null);
    setCreated(false);
    startCreate(async () => {
      const result = await createThemeParamAction(IDLE, data);
      if (result.status === "error") {
        setCreateError(result.code);
        return;
      }
      setName("");
      setCode("");
      setCodeTouched(false);
      setValueType("bool");
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
      const result = await updateThemeParamAction(IDLE, data);
      if (result.status === "error") {
        setUpdateError(result.code);
        return;
      }
      setEditingId(null);
      setUpdated(true);
      router.refresh();
    });
  }

  function onNameChange(next: string) {
    setName(next);
    if (codeTouched) return;
    setCode(
      next.trim() ? uniqueParamCode(suggestParamCode(next), taken) : "",
    );
  }

  function onCodeChange(next: string) {
    const cleaned = next
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, MAX_THEME_PARAM_CODE);
    if (!cleaned) {
      setCodeTouched(false);
      setCode(name.trim() ? uniqueParamCode(suggestParamCode(name), taken) : "");
      return;
    }
    setCodeTouched(true);
    setCode(cleaned);
  }

  function move(paramId: number, direction: "up" | "down") {
    setMoveError(null);
    startMove(async () => {
      const result = await moveThemeParamAction(themeId, paramId, direction);
      if (result.status === "error") {
        setMoveError(result.code);
        return;
      }
      router.refresh();
    });
  }

  const errorCode =
    createError ?? updateError ?? statusCode(deleteState) ?? moveError;
  const typeOptions = [
    { value: "bool", label: t("paramTypeBool") },
    { value: "int", label: t("paramTypeInt") },
  ];

  return (
    <div className={css.paramsBlock}>
      <h3 id={`theme-params-${themeId}`} className={css.panelTitle}>
        {t("paramsTitle")}
      </h3>
      <p className={css.panelLead}>{t("paramsLead")}</p>

      {errorCode ? (
        <p className={clsx(css.alert, css.alertError)} role="alert">
          {t(`errors.${errorCode}`)}
        </p>
      ) : null}
      {created ? (
        <p className={clsx(css.alert, css.alertSuccess)} role="status">
          {t("paramAdded")}
        </p>
      ) : null}
      {updated ? (
        <p className={clsx(css.alert, css.alertSuccess)} role="status">
          {t("paramUpdated")}
        </p>
      ) : null}
      {deleteState.status === "success" ? (
        <p className={clsx(css.alert, css.alertSuccess)} role="status">
          {t("paramDeleted")}
        </p>
      ) : null}

      {params.length === 0 ? (
        <p className={css.empty}>{t("paramsEmpty")}</p>
      ) : (
        <ol className={css.paramList}>
          {params.map((param, index) =>
            editingId === param.id ? (
              <li key={param.id} className={css.paramRow}>
                <ParamEditor
                  themeId={themeId}
                  param={param}
                  pending={busy}
                  typeOptions={typeOptions}
                  onSubmit={submitUpdate}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li key={param.id} className={css.paramRow}>
                <div className={css.paramMain}>
                  <p className={css.paramName}>{param.name}</p>
                  <p className={css.paramMeta}>
                    {param.code}
                    {" · "}
                    {param.valueType === "bool"
                      ? t("paramTypeBool")
                      : t("paramTypeInt")}
                  </p>
                  {param.usageCount > 0 ? (
                    <p className={css.paramWarning}>
                      {t("paramUsedWarning", { count: param.usageCount })}
                    </p>
                  ) : null}
                </div>
                <div className={css.paramActions}>
                  <button
                    type="button"
                    className={css.paramIcon}
                    aria-label={t("paramMoveUpAria", { name: param.name })}
                    disabled={busy || index === 0}
                    onClick={() => move(param.id, "up")}
                  >
                    <ChevronIcon direction="up" />
                  </button>
                  <button
                    type="button"
                    className={css.paramIcon}
                    aria-label={t("paramMoveDownAria", { name: param.name })}
                    disabled={busy || index === params.length - 1}
                    onClick={() => move(param.id, "down")}
                  >
                    <ChevronIcon direction="down" />
                  </button>
                  <button
                    type="button"
                    className={css.paramIcon}
                    title={t("paramRename")}
                    aria-label={t("paramRenameAria", { name: param.name })}
                    disabled={busy}
                    onClick={() => setEditingId(param.id)}
                  >
                    <PencilIcon />
                  </button>
                  <form
                    action={deleteAction}
                    onSubmit={(event) => {
                      const message =
                        param.usageCount > 0
                          ? t("paramDeleteUsedConfirm", {
                              count: param.usageCount,
                              name: param.name,
                            })
                          : t("paramDeleteConfirm", { name: param.name });
                      guardConfirmedSubmit(event, message);
                    }}
                  >
                    <input type="hidden" name="themeId" value={themeId} />
                    <input type="hidden" name="paramId" value={param.id} />
                    <button
                      type="submit"
                      className={clsx(css.paramIcon, css.paramDelete)}
                      aria-label={t("paramDeleteAria", { name: param.name })}
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

      <form onSubmit={submitCreate} className={css.paramForm}>
        <input type="hidden" name="themeId" value={themeId} />
        <div className={css.paramFields}>
          <label className={css.fieldStack}>
            <span className={css.themeLabel}>{t("paramName")}</span>
            <input
              className={css.input}
              name="name"
              value={name}
              maxLength={MAX_THEME_PARAM_NAME}
              required
              disabled={busy}
              onChange={(event) => onNameChange(event.target.value)}
            />
          </label>
          <label className={css.fieldStack}>
            <span className={css.themeLabel}>{t("paramCode")}</span>
            <input
              className={css.input}
              name="code"
              value={code}
              maxLength={MAX_THEME_PARAM_CODE}
              spellCheck={false}
              autoComplete="off"
              disabled={busy}
              aria-describedby={`param-code-hint-${themeId}`}
              onChange={(event) => onCodeChange(event.target.value)}
            />
          </label>
          <div className={css.fieldStack}>
            <span className={css.themeLabel} id={`param-type-${themeId}`}>
              {t("paramType")}
            </span>
            <Select
              name="valueType"
              value={valueType}
              disabled={busy}
              aria-labelledby={`param-type-${themeId}`}
              options={typeOptions}
              onChange={(next) => {
                if (next === "bool" || next === "int") setValueType(next);
              }}
            />
          </div>
        </div>
        <p className={css.fieldHint} id={`param-code-hint-${themeId}`}>
          {t("paramCodeHint")}
        </p>
        <button type="submit" className={css.createBtn} disabled={busy || !name.trim()}>
          {createPending ? t("paramAdding") : t("paramAdd")}
        </button>
      </form>
    </div>
  );
}

function ParamEditor({
  themeId,
  param,
  pending,
  typeOptions,
  onSubmit,
  onCancel,
}: {
  themeId: number;
  param: ThemeParam;
  pending: boolean;
  typeOptions: { value: string; label: string }[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("AdminContent");
  const [name, setName] = useState(param.name);
  const [code, setCode] = useState(param.code);
  const [valueType, setValueType] = useState<ThemeParamValueType>(param.valueType);
  const locked = param.usageCount > 0;

  return (
    <form onSubmit={onSubmit} className={css.paramForm}>
      <input type="hidden" name="themeId" value={themeId} />
      <input type="hidden" name="paramId" value={param.id} />
      {locked ? <input type="hidden" name="valueType" value={param.valueType} /> : null}
      <div className={css.paramFields}>
        <label className={css.fieldStack}>
          <span className={css.themeLabel}>{t("paramName")}</span>
          <input
            className={css.input}
            name="name"
            value={name}
            maxLength={MAX_THEME_PARAM_NAME}
            required
            disabled={pending}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className={css.fieldStack}>
          <span className={css.themeLabel}>{t("paramCode")}</span>
          <input
            className={css.input}
            name="code"
            value={code}
            maxLength={MAX_THEME_PARAM_CODE}
            spellCheck={false}
            autoComplete="off"
            disabled={pending}
            onChange={(event) =>
              setCode(
                event.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9_]/g, "")
                  .slice(0, MAX_THEME_PARAM_CODE),
              )
            }
          />
        </label>
        <div className={css.fieldStack}>
          <span className={css.themeLabel} id={`param-edit-type-${param.id}`}>
            {t("paramType")}
          </span>
          <Select
            name={locked ? undefined : "valueType"}
            value={locked ? param.valueType : valueType}
            disabled={pending || locked}
            aria-labelledby={`param-edit-type-${param.id}`}
            options={typeOptions}
            onChange={(next) => {
              if (next === "bool" || next === "int") setValueType(next);
            }}
          />
        </div>
      </div>
      {locked ? <p className={css.fieldHint}>{t("paramTypeLocked")}</p> : null}
      {param.usageCount > 0 ? (
        <p className={css.paramWarning}>
          {t("paramUsedWarning", { count: param.usageCount })}
        </p>
      ) : null}
      <div className={css.paramEditActions}>
        <button type="submit" className={css.createBtn} disabled={pending || !name.trim()}>
          {t("paramSave")}
        </button>
        <button type="button" className={css.cancelBtn} disabled={pending} onClick={onCancel}>
          {t("paramCancel")}
        </button>
      </div>
    </form>
  );
}
