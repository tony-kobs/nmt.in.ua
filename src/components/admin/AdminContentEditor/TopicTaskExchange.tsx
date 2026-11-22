"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  applyTopicTaskFileAction,
  previewTopicTaskFileAction,
} from "@/modules/admin-content/topicTaskActions";
import css from "./AdminContentEditor.module.css";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function TopicTaskExchange({ themeId }: { themeId: number }) {
  const t = useTranslations("AdminContent");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [deleteMissing, setDeleteMissing] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof previewTopicTaskFileAction>> | null>(null);

  async function readFile(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    setName(file.name);
    setBody(bytesToBase64(bytes));
    setPlan(null);
    setApplied(false);
    setMessage(null);
  }

  async function preview() {
    setPending(true);
    setApplied(false);
    try {
      const result = await previewTopicTaskFileAction({ themeId, name, bodyBase64: body, deleteMissing });
      setPlan(result);
      setMessage(result.ok ? null : result.message);
    } finally {
      setPending(false);
    }
  }

  async function apply() {
    setPending(true);
    try {
      const result = await applyTopicTaskFileAction({ themeId, name, bodyBase64: body, deleteMissing });
      setPlan(result);
      setApplied(result.ok && result.applied);
      setMessage(result.ok ? null : result.message);
    } finally {
      setPending(false);
    }
  }

  const summary = plan?.ok ? plan.plan : null;

  return (
    <div className={css.exchange}>
      <div className={css.exchangeLinks}>
        <a className={css.cancelBtn} href={`/api/admin/theme-tasks/${themeId}?format=csv`}>{t("exportCsv")}</a>
        <a className={css.cancelBtn} href={`/api/admin/theme-tasks/${themeId}?format=json`}>{t("exportJson")}</a>
        <a className={css.cancelBtn} href={`/api/admin/theme-tasks/${themeId}?format=xlsx`}>{t("exportExcel")}</a>
      </div>
      <label className={css.searchLabel} htmlFor="topic-task-file">{t("importFile")}</label>
      <input
        id="topic-task-file"
        className={css.input}
        type="file"
        accept=".csv,.json,.xlsx,text/csv,application/json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void readFile(file);
        }}
      />
      <label className={css.exchangeCheck}>
        <input
          type="checkbox"
          checked={deleteMissing}
          onChange={(event) => {
            setDeleteMissing(event.target.checked);
            setPlan(null);
          }}
        />
        <span>{t("deleteMissing")}</span>
      </label>
      <div className={css.exchangeLinks}>
        <button type="button" className={css.cancelBtn} disabled={!body || pending} onClick={() => void preview()}>
          {pending ? t("checking") : t("previewImport")}
        </button>
        <button
          type="button"
          className={css.createBtn}
          disabled={!summary || summary.errors.length > 0 || pending}
          onClick={() => void apply()}
        >
          {t("applyImport")}
        </button>
      </div>
      {message ? <p className={css.alertError} role="alert">{message}</p> : null}
      {applied ? <p className={css.alertSuccess} role="status">{t("importApplied")}</p> : null}
      {summary ? (
        <div className={css.exchangePreview}>
          <p>{t("importCreate", { count: summary.create.length })}</p>
          <p>{t("importUpdate", { count: summary.update.length })}</p>
          <p>{t("importSame", { count: summary.unchanged })}</p>
          {summary.deleteIds.length > 0 ? <p>{t("importDelete", { count: summary.deleteIds.length })}</p> : null}
          {summary.skipped.length > 0 ? (
            <ul>
              {summary.skipped.map((item) => (
                <li key={item.id}>{t("importSkipped", { id: item.id, reason: item.reason })}</li>
              ))}
            </ul>
          ) : null}
          {summary.errors.length > 0 ? (
            <ul>
              {summary.errors.map((item) => (
                <li key={`${item.row}-${item.message}`}>{t("importError", { row: item.row, message: item.message })}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
