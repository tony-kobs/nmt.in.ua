"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  applyMarathonCsvAction,
  previewMarathonCsvAction,
} from "@/modules/marathons/daily/actions";
import type { CsvIssue } from "@/modules/marathons/daily/marathonCsv";
import css from "../marathon.module.css";

const MAX_BYTES = 500_000;

type Preview = Extract<
  Awaited<ReturnType<typeof previewMarathonCsvAction>>,
  { ok: true }
>["preview"];

function rowLabel(issue: CsvIssue): string {
  return issue.row > 0 ? `Рядок ${issue.row}: ${issue.message}` : issue.message;
}

export function MarathonCsvPanel({ marathonId }: { marathonId?: number }) {
  const t = useTranslations("Marathon");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState<CsvIssue[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState<"preview" | "apply" | null>(null);

  async function readFile(file: File | null) {
    setErrors([]);
    setPreview(null);
    if (!file) {
      setText("");
      setFileName("");
      return;
    }
    if (file.size > MAX_BYTES) {
      setText("");
      setFileName(file.name);
      setErrors([{ row: 0, message: t("csvTooBig") }]);
      return;
    }
    setFileName(file.name);
    setText(await file.text());
  }

  async function previewFile() {
    if (!text) {
      setErrors([{ row: 0, message: t("csvNeedFile") }]);
      return;
    }
    setPending("preview");
    setErrors([]);
    setPreview(null);
    try {
      const result = await previewMarathonCsvAction(text);
      if (!result.ok) setErrors(result.errors);
      else setPreview(result.preview);
    } catch {
      setErrors([{ row: 0, message: t("errors.server") }]);
    } finally {
      setPending(null);
    }
  }

  async function applyFile() {
    if (!text) {
      setErrors([{ row: 0, message: t("csvNeedFile") }]);
      return;
    }
    setPending("apply");
    setErrors([]);
    try {
      const result = await applyMarathonCsvAction(text);
      if (result && !result.ok) setErrors(result.errors);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "digest" in error &&
        String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
      ) {
        throw error;
      }
      setErrors([{ row: 0, message: t("errors.server") }]);
    } finally {
      setPending(null);
    }
  }

  return (
    <section className={css.card} aria-labelledby="marathon-csv">
      <h2 id="marathon-csv">{t("csvTitle")}</h2>
      <p className={css.meta}>{t("csvLead")}</p>
      <p className={css.meta}>{t("csvHelp")}</p>
      <div className={css.actions}>
        <a className={css.buttonQuiet} href="/api/admin/marathons/template">
          {t("csvTemplate")}
        </a>
        {marathonId ? (
          <a className={css.buttonQuiet} href={`/api/admin/marathons/${marathonId}/structure`}>
            {t("csvExport")}
          </a>
        ) : null}
      </div>
      <div className={css.field}>
        <label className={css.fieldLabel} htmlFor="marathon-csv-file">
          {t("csvFile")}
        </label>
        <input
          id="marathon-csv-file"
          className={css.input}
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => void readFile(event.target.files?.[0] ?? null)}
        />
      </div>
      {fileName ? <p className={css.meta}>{fileName}</p> : null}
      <div className={css.actions}>
        <button
          type="button"
          className={css.buttonQuiet}
          disabled={pending !== null}
          onClick={() => void previewFile()}
        >
          {pending === "preview" ? t("working") : t("csvPreview")}
        </button>
        <button
          type="button"
          className={css.button}
          disabled={pending !== null || !preview}
          onClick={() => void applyFile()}
        >
          {pending === "apply" ? t("saving") : t("csvApply")}
        </button>
      </div>
      {preview ? (
        <div>
          <p className={css.meta}>
            {preview.mode === "create"
              ? t("csvCreate", { title: preview.title, slug: preview.slug })
              : t("csvUpdate", { title: preview.title, slug: preview.slug })}
          </p>
          <p className={css.meta}>
            {t("csvCounts", {
              days: preview.days,
              tasks: preview.tasks,
              materials: preview.materials,
              riddles: preview.riddles,
            })}
          </p>
          <ul className={css.taskOptions}>
            {preview.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {errors.length > 0 ? (
        <div className={css.alertError} role="alert">
          <ul>
            {errors.map((issue) => (
              <li key={`${issue.row}-${issue.message}`}>{rowLabel(issue)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
