"use client";

import { useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { MarathonCsvPanel } from "./MarathonCsvPanel";
import {
  applyMarathonJsonAction,
  previewMarathonJsonAction,
} from "@/modules/marathons/daily/actions";
import type { CsvIssue } from "@/modules/marathons/daily/marathonCsv";
import css from "../marathon.module.css";

const JSON_MAX = 500_000;
const XLSX_MAX = 2_000_000;

type Preview = Extract<
  Awaited<ReturnType<typeof previewMarathonJsonAction>>,
  { ok: true }
>["preview"];

type Payload =
  | { ok: true; preview: Preview }
  | { ok: true; href: string }
  | { ok: false; errors: CsvIssue[] };

function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "digest" in error
    && String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}

function PreviewBlock({ preview, t }: { preview: Preview; t: ReturnType<typeof useTranslations<"Marathon">> }) {
  return (
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
  );
}

function ErrorList({ errors, prefix }: { errors: CsvIssue[]; prefix: (issue: CsvIssue) => string }) {
  if (errors.length === 0) return null;
  return (
    <div className={css.alertError} role="alert">
      <ul>
        {errors.map((issue) => (
          <li key={`${issue.row}-${issue.message}`}>{prefix(issue)}</li>
        ))}
      </ul>
    </div>
  );
}

const FORMAT_KEY = "nmt-marathon-import-format";
const FORMATS = ["xlsx", "json", "csv"] as const;
type ImportFormat = (typeof FORMATS)[number];

const formatListeners = new Set<() => void>();

function storedFormat(): ImportFormat {
  const value = window.localStorage.getItem(FORMAT_KEY);
  return value === "json" || value === "csv" || value === "xlsx" ? value : "xlsx";
}

function subscribeFormat(listener: () => void) {
  formatListeners.add(listener);
  return () => formatListeners.delete(listener);
}

function rememberFormat(next: ImportFormat) {
  window.localStorage.setItem(FORMAT_KEY, next);
  for (const listener of formatListeners) listener();
}

export function MarathonFormatsPanel({ marathonId }: { marathonId?: number }) {
  const t = useTranslations("Marathon");
  const format = useSyncExternalStore(subscribeFormat, storedFormat, () => "xlsx" as const);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  function choose(next: ImportFormat) {
    rememberFormat(next);
  }

  function moveTo(index: number) {
    const next = FORMATS[index];
    if (!next) return;
    choose(next);
    tabs.current[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = FORMATS.indexOf(format);
    const last = FORMATS.length - 1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveTo(current >= last ? 0 : current + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveTo(current <= 0 ? last : current - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveTo(last);
    }
  }

  const labels: Record<ImportFormat, string> = {
    xlsx: t("formatExcel"),
    json: t("formatJson"),
    csv: t("formatCsv"),
  };

  return (
    <section className={css.card} aria-labelledby="marathon-import-title">
      <h2 id="marathon-import-title">{t("csvTitle")}</h2>
      <div
        className={css.formatTabs}
        role="tablist"
        aria-label={t("importFormats")}
        onKeyDown={onKeyDown}
      >
        {FORMATS.map((item, index) => {
          const selected = format === item;
          return (
            <button
              key={item}
              ref={(node) => {
                tabs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`marathon-import-${item}`}
              aria-selected={selected}
              aria-controls={`marathon-import-panel-${item}`}
              tabIndex={selected ? 0 : -1}
              className={selected ? css.formatTabOn : css.formatTab}
              onClick={() => choose(item)}
            >
              {labels[item]}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`marathon-import-panel-${format}`}
        aria-labelledby={`marathon-import-${format}`}
      >
        {format === "xlsx" ? <XlsxCard marathonId={marathonId} /> : null}
        {format === "json" ? <JsonCard marathonId={marathonId} /> : null}
        {format === "csv" ? <MarathonCsvPanel marathonId={marathonId} /> : null}
      </div>
    </section>
  );
}

function JsonCard({ marathonId }: { marathonId?: number }) {
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
    if (file.size > JSON_MAX) {
      setText("");
      setFileName(file.name);
      setErrors([{ row: 0, message: t("jsonTooBig") }]);
      return;
    }
    setFileName(file.name);
    setText(await file.text());
  }

  async function previewFile() {
    if (!text) {
      setErrors([{ row: 0, message: t("jsonNeedFile") }]);
      return;
    }
    setPending("preview");
    setErrors([]);
    setPreview(null);
    try {
      const result = await previewMarathonJsonAction(text);
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
      setErrors([{ row: 0, message: t("jsonNeedFile") }]);
      return;
    }
    setPending("apply");
    setErrors([]);
    try {
      const result = await applyMarathonJsonAction(text);
      if (result && !result.ok) setErrors(result.errors);
    } catch (error) {
      if (isRedirect(error)) throw error;
      setErrors([{ row: 0, message: t("errors.server") }]);
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <p className={css.meta}>{t("jsonLead")}</p>
      <p className={css.meta}>{t("jsonHelp")}</p>
      <div className={css.actions}>
        <a className={css.buttonQuiet} href="/api/admin/marathons/template-json">
          {t("jsonTemplate")}
        </a>
        {marathonId ? (
          <a className={css.buttonQuiet} href={`/api/admin/marathons/${marathonId}/structure-json`}>
            {t("jsonExport")}
          </a>
        ) : null}
      </div>
      <div className={css.field}>
        <label className={css.fieldLabel} htmlFor="marathon-json-file">
          {t("jsonFile")}
        </label>
        <input
          id="marathon-json-file"
          className={css.input}
          type="file"
          accept=".json,application/json"
          onChange={(event) => void readFile(event.target.files?.[0] ?? null)}
        />
      </div>
      {fileName ? <p className={css.meta}>{fileName}</p> : null}
      <p className={css.meta}>{t("importHint")}</p>
      <div className={css.actions}>
        <button type="button" className={css.buttonQuiet} disabled={pending !== null} onClick={() => void previewFile()}>
          {pending === "preview" ? t("working") : t("csvPreview")}
        </button>
        <button type="button" className={css.button} disabled={pending !== null || !preview} onClick={() => void applyFile()}>
          {pending === "apply" ? t("saving") : t("csvApply")}
        </button>
      </div>
      {preview ? <PreviewBlock preview={preview} t={t} /> : null}
      <ErrorList
        errors={errors}
        prefix={(issue) => (issue.row > 0 ? `Елемент ${issue.row}: ${issue.message}` : issue.message)}
      />
    </>
  );
}

function XlsxCard({ marathonId }: { marathonId?: number }) {
  const t = useTranslations("Marathon");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<CsvIssue[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState<"preview" | "apply" | null>(null);

  function chooseFile(next: File | null) {
    setErrors([]);
    setPreview(null);
    if (next && next.size > XLSX_MAX) {
      setFile(null);
      setErrors([{ row: 0, message: t("xlsxTooBig") }]);
      return;
    }
    setFile(next);
  }

  async function send(mode: "preview" | "apply") {
    if (!file) {
      setErrors([{ row: 0, message: t("xlsxNeedFile") }]);
      return;
    }
    setPending(mode);
    setErrors([]);
    if (mode === "preview") setPreview(null);
    try {
      const body = new FormData();
      body.set("mode", mode);
      body.set("file", file);
      const response = await fetch("/api/admin/marathons/xlsx", { method: "POST", body });
      const payload = (await response.json()) as Payload;
      if (!payload.ok) {
        setErrors(payload.errors);
        return;
      }
      if ("href" in payload) {
        window.location.assign(payload.href);
        return;
      }
      setPreview(payload.preview);
    } catch {
      setErrors([{ row: 0, message: t("errors.server") }]);
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <p className={css.meta}>{t("xlsxLead")}</p>
      <p className={css.meta}>{t("xlsxHelp")}</p>
      <div className={css.actions}>
        <a className={css.buttonQuiet} href="/api/admin/marathons/template-xlsx">
          {t("xlsxTemplate")}
        </a>
        {marathonId ? (
          <a className={css.buttonQuiet} href={`/api/admin/marathons/${marathonId}/structure-xlsx`}>
            {t("xlsxExport")}
          </a>
        ) : null}
      </div>
      <div className={css.field}>
        <label className={css.fieldLabel} htmlFor="marathon-xlsx-file">
          {t("xlsxFile")}
        </label>
        <input
          id="marathon-xlsx-file"
          className={css.input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
        />
      </div>
      {file ? <p className={css.meta}>{file.name}</p> : null}
      <p className={css.meta}>{t("importHint")}</p>
      <div className={css.actions}>
        <button type="button" className={css.buttonQuiet} disabled={pending !== null} onClick={() => void send("preview")}>
          {pending === "preview" ? t("working") : t("csvPreview")}
        </button>
        <button type="button" className={css.button} disabled={pending !== null || !preview} onClick={() => void send("apply")}>
          {pending === "apply" ? t("saving") : t("csvApply")}
        </button>
      </div>
      {preview ? <PreviewBlock preview={preview} t={t} /> : null}
      <ErrorList errors={errors} prefix={(issue) => issue.message} />
    </>
  );
}
