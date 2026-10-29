"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { MaterialDocument } from "@/components/learningMaterials/MaterialDocument";
import type { MaterialContentBlock } from "@/content/learningMaterials/sourceBlocks";
import { saveTextbookSectionAction } from "@/modules/textbook/actions";
import { TEXTBOOK_IMAGE_MAX_BYTES } from "@/modules/textbook/imageLimits";
import { lintTextbookMarkup, type TextbookLintCode } from "@/modules/textbook/lint";
import { parseTextbookMarkup } from "@/modules/textbook/markup";
import {
  applyTextbookSnippet,
  insertMarkupBlock,
  replaceMarkupToken,
  SNIPPET_IDS,
  textbookImageMarkup,
  uploadPlaceholder,
  type SnippetId,
} from "@/modules/textbook/templates";
import css from "./TextbookEditor.module.css";

type TextbookEditorProps = {
  code: string;
  name: string;
  initialBody: string;
  staticBody: string;
  publishedBody: string | null;
  studentBlocks: MaterialContentBlock[];
  saved: "draft" | "published" | null;
  error: string | null;
  publicHref: string;
};

type UploadError = "type" | "size" | "failed";
type Pane = "editor" | "preview";

const ISSUE_LIMIT = 8;
let uploadSerial = 0;

function nextUploadToken(): string {
  uploadSerial += 1;
  return `pending-${uploadSerial.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function SaveButtons() {
  const t = useTranslations("TextbookEditor");
  const { pending } = useFormStatus();
  return (
    <div className={css.actions}>
      <button className={css.quiet} type="submit" name="intent" value="draft" disabled={pending}>
        {t("saveDraft")}
      </button>
      <button className={css.publish} type="submit" name="intent" value="publish" disabled={pending}>
        {t("publish")}
      </button>
    </div>
  );
}

function imageFiles(data: DataTransfer): File[] {
  const fromList = [...data.files];
  const files = fromList.length > 0 ? fromList : [];
  if (files.length === 0) {
    for (const item of data.items) {
      if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files.filter((file) => file.type === "" || file.type.startsWith("image/"));
}

function clientImageError(file: File): UploadError | null {
  if (file.size > TEXTBOOK_IMAGE_MAX_BYTES) return "size";
  if (file.size === 0 || file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) return "type";
  if (file.type && !file.type.startsWith("image/")) return "type";
  return null;
}

async function postTextbookImage(
  file: File,
): Promise<{ ok: true; src: string } | { ok: false; error: UploadError }> {
  const form = new FormData();
  form.set("file", file);
  let response: Response;
  try {
    response = await fetch("/api/admin/textbook-images", { method: "POST", body: form });
  } catch {
    return { ok: false, error: "failed" };
  }
  let payload: { ok?: boolean; src?: string; error?: string };
  try {
    payload = (await response.json()) as { ok?: boolean; src?: string; error?: string };
  } catch {
    return { ok: false, error: "failed" };
  }
  if (payload.ok && payload.src) return { ok: true, src: payload.src };
  if (payload.error === "type" || payload.error === "size") return { ok: false, error: payload.error };
  return { ok: false, error: "failed" };
}

export function TextbookEditor({
  code,
  name,
  initialBody,
  staticBody,
  publishedBody,
  studentBlocks,
  saved,
  error,
  publicHref,
}: TextbookEditorProps) {
  const t = useTranslations("TextbookEditor");
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [body, setBody] = useState(initialBody);
  const [synced, setSynced] = useState(initialBody);
  const [previewBody, setPreviewBody] = useState(initialBody);
  const [pane, setPane] = useState<Pane>("editor");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<UploadError | null>(null);
  const bodyRef = useRef(body);
  const caretGen = useRef(0);

  if (initialBody !== synced) {
    setSynced(initialBody);
    setBody(initialBody);
    setPreviewBody(initialBody);
  }

  useEffect(() => {
    bodyRef.current = body;
  }, [body]);

  useEffect(() => {
    const timer = window.setTimeout(() => setPreviewBody(body), 280);
    return () => window.clearTimeout(timer);
  }, [body]);

  const blocks = useMemo(() => parseTextbookMarkup(previewBody), [previewBody]);
  const issues = useMemo(() => lintTextbookMarkup(previewBody), [previewBody]);
  const studentNote =
    publishedBody !== null && body === publishedBody
      ? t("seesPublished")
      : publishedBody !== null
        ? t("seesPrevious")
        : body !== staticBody
          ? t("seesStaticDirty")
          : t("seesStatic");

  function writeBody(next: string, range?: { start: number; end: number }) {
    bodyRef.current = next;
    setBody(next);
    if (!range) return;
    const generation = caretGen.current + 1;
    caretGen.current = generation;
    const start = range.start;
    const end = range.end;
    window.requestAnimationFrame(() => {
      if (caretGen.current !== generation) return;
      const field = fieldRef.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(start, end);
    });
  }

  function insertSnippet(id: SnippetId) {
    const field = fieldRef.current;
    const start = field?.selectionStart ?? bodyRef.current.length;
    const end = field?.selectionEnd ?? start;
    const edit = applyTextbookSnippet(bodyRef.current, start, end, id);
    writeBody(edit.value, { start: edit.selectionStart, end: edit.selectionEnd });
    setPane("editor");
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0) {
      setUploadError("type");
      return;
    }
    setUploadError(null);
    const field = fieldRef.current;
    let start = field?.selectionStart ?? bodyRef.current.length;
    let end = field?.selectionEnd ?? start;
    setUploading((count) => count + files.length);
    for (const file of files) {
      const rejected = clientImageError(file);
      if (rejected) {
        setUploadError(rejected);
        setUploading((count) => count - 1);
        continue;
      }
      const token = nextUploadToken();
      const marker = uploadPlaceholder(token);
      const inserted = insertMarkupBlock(bodyRef.current, start, end, marker);
      writeBody(inserted.value, { start: inserted.selectionStart, end: inserted.selectionEnd });
      start = inserted.selectionEnd;
      end = start;
      const saved = await postTextbookImage(file);
      const markerAt = bodyRef.current.indexOf(marker);
      if (!saved.ok) {
        setUploadError(saved.error);
        if (markerAt !== -1) {
          const cleared = replaceMarkupToken(bodyRef.current, token, "");
          writeBody(cleared);
          start = markerAt;
          end = markerAt;
        }
        setUploading((count) => count - 1);
        continue;
      }
      const markup = textbookImageMarkup(t("imageAlt"), saved.src);
      if (markerAt === -1) {
        const appended = insertMarkupBlock(
          bodyRef.current,
          bodyRef.current.length,
          bodyRef.current.length,
          markup,
        );
        writeBody(appended.value, { start: appended.selectionStart, end: appended.selectionEnd });
        start = appended.selectionEnd;
      } else {
        const next =
          bodyRef.current.slice(0, markerAt) + markup + bodyRef.current.slice(markerAt + marker.length);
        const caret = markerAt + markup.length;
        writeBody(next, { start: caret, end: caret });
        start = caret;
      }
      end = start;
      setUploading((count) => count - 1);
    }
    setPane("editor");
  }

  function onToolbarKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const index = tabs.findIndex((tab) => tab === document.activeElement);
    if (index === -1) return;
    event.preventDefault();
    const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
    tabs[next]?.focus();
    tabs[next]?.click();
  }

  const issueText = (code: TextbookLintCode, line: number, detail: string) => {
    if (code === "formula") return t("issueFormula", { line, detail });
    if (code === "fence") return t("issueFence", { line, detail });
    if (code === "fence-end") return t("issueFenceEnd", { line, detail });
    if (code === "image") return t("issueImage", { line });
    if (code === "paper") return t("issuePaper", { line });
    return t("issueMath", { line });
  };

  const visibleIssues = issues.slice(0, ISSUE_LIMIT);

  return (
    <div className={css.wrap}>
      <Link className={css.back} href="/admin/textbook">
        {t("back")}
      </Link>
      {saved === "published" ? (
        <p className={css.notice} role="status">
          {t("published")}
        </p>
      ) : null}
      {saved === "draft" ? (
        <p className={css.notice} role="status">
          {t("draftSaved")}
        </p>
      ) : null}
      {error === "size" ? (
        <p className={css.error} role="alert">
          {t("tooLong")}
        </p>
      ) : null}
      <p className={css.note}>{studentNote}</p>

      <form className={css.form} action={saveTextbookSectionAction}>
        <input type="hidden" name="code" value={code} />
        <div className={css.stage} data-pane={pane}>
          <div
            className={css.tabs}
            role="tablist"
            aria-label={t("panes")}
            onKeyDown={onToolbarKey}
          >
            <button
              className={css.tab}
              type="button"
              role="tab"
              id="textbook-tab-editor"
              aria-selected={pane === "editor"}
              aria-controls="textbook-pane-editor"
              onClick={() => setPane("editor")}
            >
              {t("tabEditor")}
            </button>
            <button
              className={css.tab}
              type="button"
              role="tab"
              id="textbook-tab-preview"
              aria-selected={pane === "preview"}
              aria-controls="textbook-pane-preview"
              onClick={() => setPane("preview")}
            >
              {issues.length > 0 ? t("tabPreviewIssues", { count: issues.length }) : t("tabPreview")}
            </button>
          </div>

          <div
            className={css.editorPane}
            id="textbook-pane-editor"
            role="tabpanel"
            aria-labelledby="textbook-tab-editor"
          >
            <label className={css.label} htmlFor="textbook-body">
              {t("bodyLabel", { name })}
            </label>
            <div className={css.toolbar} role="toolbar" aria-label={t("toolbar")}>
              {SNIPPET_IDS.map((id) => (
                <button key={id} className={css.tool} type="button" onClick={() => insertSnippet(id)}>
                  {t(`insert.${id}`)}
                </button>
              ))}
              <button className={css.tool} type="button" onClick={() => fileRef.current?.click()}>
                {t("pickFile")}
              </button>
            </div>
            <input
              ref={fileRef}
              className={css.file}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                event.target.value = "";
                if (files.length > 0) void uploadFiles(files);
              }}
            />
            <details className={css.help}>
              <summary>{t("howTo")}</summary>
              <p>{t("howToBody")}</p>
              <pre className={css.sample}>{`:::graph
\\[y = x - 3\\]

| X | -1 | 0 | 1 |
| Y |  |  |  |
:::`}</pre>
            </details>
            {issues.length > 0 ? (
              <div className={css.issues}>
                <p className={css.issueCount} role="status">
                  {t("issueCount", { count: issues.length })}
                </p>
                <ul className={css.issueList}>
                  {visibleIssues.map((issue, index) => (
                    <li key={`${issue.line}-${issue.code}-${index}`}>
                      {issueText(issue.code, issue.line, issue.detail)}
                    </li>
                  ))}
                </ul>
                {issues.length > ISSUE_LIMIT ? (
                  <p className={css.issueMore}>{t("issueMore", { count: issues.length - ISSUE_LIMIT })}</p>
                ) : null}
              </div>
            ) : null}
            {uploading > 0 ? (
              <p className={css.notice} role="status" aria-busy="true">
                {t("uploading")}
              </p>
            ) : null}
            {uploadError ? (
              <p className={css.error} role="alert">
                {uploadError === "type" ? t("uploadType") : uploadError === "size" ? t("uploadSize") : t("uploadFailed")}
              </p>
            ) : null}
            <div
              className={css.fieldWrap}
              onDragEnter={(event: DragEvent<HTMLDivElement>) => {
                if (![...event.dataTransfer.types].includes("Files")) return;
                event.preventDefault();
                dragDepth.current += 1;
                setDragging(true);
              }}
              onDragOver={(event) => {
                if (![...event.dataTransfer.types].includes("Files")) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDragLeave={() => {
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (dragDepth.current === 0) setDragging(false);
              }}
              onDrop={(event) => {
                if (![...event.dataTransfer.types].includes("Files")) return;
                event.preventDefault();
                dragDepth.current = 0;
                setDragging(false);
                void uploadFiles(imageFiles(event.dataTransfer));
              }}
            >
              <textarea
                ref={fieldRef}
                id="textbook-body"
                className={css.field}
                name="body"
                value={body}
                onChange={(event) => {
                  bodyRef.current = event.target.value;
                  setBody(event.target.value);
                }}
                onPaste={(event) => {
                  const files = imageFiles(event.clipboardData);
                  if (files.length === 0) return;
                  event.preventDefault();
                  void uploadFiles(files);
                }}
                spellCheck={false}
                aria-invalid={issues.length > 0 || undefined}
              />
              {dragging ? (
                <p className={css.drop} role="status">
                  {t("dropHint")}
                </p>
              ) : null}
            </div>
          </div>

          <section
            className={css.previewPane}
            id="textbook-pane-preview"
            role="tabpanel"
            aria-labelledby="textbook-tab-preview"
          >
            <h2 id="textbook-draft-title" className={css.previewTitle}>
              {t("draftPreview")}
            </h2>
            {blocks.length > 0 ? (
              <MaterialDocument blocks={blocks} />
            ) : (
              <p className={css.empty}>{t("draftEmpty")}</p>
            )}
          </section>
        </div>
        <SaveButtons />
      </form>

      <section className={css.preview} aria-labelledby="textbook-student-title">
        <div className={css.previewHead}>
          <h2 id="textbook-student-title" className={css.previewTitle}>
            {t("studentPreview")}
          </h2>
          <a className={css.publicLink} href={publicHref}>
            {t("openPublic")}
          </a>
        </div>
        {studentBlocks.length > 0 ? (
          <MaterialDocument blocks={studentBlocks} />
        ) : (
          <p className={css.empty}>{t("studentEmpty")}</p>
        )}
      </section>
    </div>
  );
}
