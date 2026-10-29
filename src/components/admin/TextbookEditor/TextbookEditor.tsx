"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { useFormStatus } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { MaterialDocument } from "@/components/learningMaterials/MaterialDocument";
import { askConfirm } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import type { MaterialContentBlock } from "@/content/learningMaterials/sourceBlocks";
import { formatKyivClock } from "@/lib/relativeTime";
import {
  autosaveTextbookDraftAction,
  loadTextbookDraftAction,
  saveTextbookSectionAction,
} from "@/modules/textbook/actions";
import {
  AUTOSAVE_DELAY_MS,
  autosaveReady,
  isBlankTextbookDraft,
  readTextbookDraftBackup,
  shouldWarnBeforeUnload,
  writeTextbookDraftBackup,
  type DraftBackup,
} from "@/modules/textbook/draftBackup";
import { TEXTBOOK_BODY_MAX, type TextbookVersionSummary, type TextbookWriteResult } from "@/modules/textbook/draftTypes";
import { TEXTBOOK_IMAGE_MAX_BYTES } from "@/modules/textbook/imageLimits";
import { lintTextbookMarkup, type TextbookLintCode } from "@/modules/textbook/lint";
import { parseTextbookMarkup } from "@/modules/textbook/markup";
import {
  buildTopicTemplate,
  topicTemplateKindForCode,
  type TopicTemplateKind,
} from "@/modules/textbook/topicTemplates";
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
import { TextbookVersionList } from "./TextbookVersionList";

type TextbookEditorProps = {
  code: string;
  name: string;
  initialBody: string;
  initialRevision: number;
  initialUpdatedAt: string | null;
  staticBody: string;
  publishedBody: string | null;
  studentBlocks: MaterialContentBlock[];
  versions: TextbookVersionSummary[];
  saved: "draft" | "published" | null;
  error: string | null;
  publicHref: string;
};

type UploadError = "type" | "size" | "failed";
type Pane = "editor" | "preview";
type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict" | "size";

const ISSUE_LIMIT = 8;
let uploadSerial = 0;

function nextUploadToken(): string {
  uploadSerial += 1;
  return `pending-${uploadSerial.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function SaveButtons({ locked }: { locked: boolean }) {
  const t = useTranslations("TextbookEditor");
  const { pending } = useFormStatus();
  const disabled = pending || locked;
  return (
    <div className={css.actions}>
      <button className={css.quiet} type="submit" name="intent" value="draft" disabled={disabled}>
        {t("saveDraft")}
      </button>
      <button className={css.publish} type="submit" name="intent" value="publish" disabled={disabled}>
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
  initialRevision,
  initialUpdatedAt,
  staticBody,
  publishedBody,
  studentBlocks,
  versions,
  saved,
  error,
  publicHref,
}: TextbookEditorProps) {
  const t = useTranslations("TextbookEditor");
  const locale = useLocale();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const serverKey = `${code}\0${initialRevision}\0${initialUpdatedAt ?? ""}\0${initialBody}`;
  const [seenServer, setSeenServer] = useState(serverKey);
  const [body, setBody] = useState(initialBody);
  const [previewBody, setPreviewBody] = useState(initialBody);
  const [revision, setRevision] = useState(initialRevision);
  const [savedBody, setSavedBody] = useState(initialBody);
  const [savedAt, setSavedAt] = useState(initialUpdatedAt);
  const [status, setStatus] = useState<SaveStatus>(
    initialRevision > 0 && initialUpdatedAt ? "saved" : "idle",
  );
  const [conflict, setConflict] = useState(false);
  const [pane, setPane] = useState<Pane>("editor");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<UploadError | null>(null);
  const [pickingTemplate, setPickingTemplate] = useState(false);
  const [backupOffer, setBackupOffer] = useState<DraftBackup | null>(null);
  const bodyRef = useRef(body);
  const savedBodyRef = useRef(savedBody);
  const revisionRef = useRef(revision);
  const savingRef = useRef(false);
  const heldRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const caretGen = useRef(0);
  const suggested = topicTemplateKindForCode(code);
  const showTemplates = pickingTemplate || isBlankTextbookDraft(body);

  if (serverKey !== seenServer) {
    setSeenServer(serverKey);
    setBody(initialBody);
    setPreviewBody(initialBody);
    setSavedBody(initialBody);
    setRevision(initialRevision);
    setSavedAt(initialUpdatedAt);
    setConflict(false);
    setStatus(initialRevision > 0 && initialUpdatedAt ? "saved" : "idle");
    setBackupOffer(null);
  }

  useEffect(() => {
    bodyRef.current = body;
    savedBodyRef.current = savedBody;
    revisionRef.current = revision;
    heldRef.current = conflict;
  }, [body, savedBody, revision, conflict]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = readTextbookDraftBackup(window.localStorage, code);
      setBackupOffer(stored && stored.body !== initialBody ? stored : null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [code, initialBody]);

  useEffect(() => {
    const stored = readTextbookDraftBackup(window.localStorage, code);
    if (stored && stored.body !== initialBody && body === initialBody) return;
    const timer = window.setTimeout(() => {
      writeTextbookDraftBackup(window.localStorage, code, {
        body: bodyRef.current,
        revision: revisionRef.current,
        savedAt: new Date().toISOString(),
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [body, revision, code, initialBody]);

  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      const stored = readTextbookDraftBackup(window.localStorage, code);
      const keepBackup = Boolean(stored && stored.body !== initialBody && bodyRef.current === initialBody);
      if (!keepBackup) {
        writeTextbookDraftBackup(window.localStorage, code, {
          body: bodyRef.current,
          revision: revisionRef.current,
          savedAt: new Date().toISOString(),
        });
      }
      if (!shouldWarnBeforeUnload(bodyRef.current, savedBodyRef.current)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [code, initialBody]);

  useEffect(() => {
    const timer = window.setTimeout(() => setPreviewBody(body), 280);
    return () => window.clearTimeout(timer);
  }, [body]);

  useEffect(() => {
    if (
      !autosaveReady({
        body,
        savedBody,
        uploading: uploading > 0,
        saving: savingRef.current,
        held: heldRef.current || conflict,
      })
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      timerRef.current = null;
      void persist(revisionRef.current);
    }, AUTOSAVE_DELAY_MS);
    timerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (timerRef.current === timer) timerRef.current = null;
    };

    async function persist(expected: number) {
      if (savingRef.current || heldRef.current) return;
      const snapshot = bodyRef.current;
      if (snapshot === savedBodyRef.current) return;
      if (snapshot.length > TEXTBOOK_BODY_MAX) {
        setStatus("size");
        return;
      }
      savingRef.current = true;
      setStatus("saving");
      let result: TextbookWriteResult;
      try {
        result = await autosaveTextbookDraftAction({
          code,
          body: snapshot,
          expectedRevision: expected,
        });
      } catch {
        result = { ok: false, reason: "error" };
      }
      savingRef.current = false;
      if (!result.ok) {
        if (result.reason === "conflict") {
          heldRef.current = true;
          setConflict(true);
          setStatus("conflict");
          return;
        }
        setStatus(result.reason === "size" ? "size" : "error");
        return;
      }
      if (bodyRef.current !== snapshot && result.revision) {
        revisionRef.current = result.revision;
        setRevision(result.revision);
        savedBodyRef.current = snapshot;
        setSavedBody(snapshot);
        setSavedAt(result.savedAt);
        setStatus("saved");
        return;
      }
      revisionRef.current = result.revision;
      savedBodyRef.current = snapshot;
      heldRef.current = false;
      setRevision(result.revision);
      setSavedBody(snapshot);
      setSavedAt(result.savedAt);
      setConflict(false);
      setStatus("saved");
    }
  }, [body, savedBody, uploading, conflict, code]);

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
  const clock = savedAt ? formatKyivClock(savedAt, locale) : "";
  const statusLabel =
    status === "saving"
      ? t("autosaveSaving")
      : status === "size"
        ? t("tooLong")
        : status === "error"
          ? t("autosaveError")
          : status === "conflict"
            ? null
            : clock && revision > 0
              ? t("autosaveSaved", { time: clock })
              : null;

  function markConflict() {
    heldRef.current = true;
    setConflict(true);
    setStatus("conflict");
  }

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

  async function applyTemplate(kind: TopicTemplateKind) {
    if (bodyRef.current.trim()) {
      const ok = await askConfirm(t("templateReplace"));
      if (!ok) return;
    }
    const next = buildTopicTemplate(kind);
    writeBody(next.markup, { start: next.selectStart, end: next.selectEnd });
    setPickingTemplate(false);
    setPane("editor");
  }

  function acceptRestored(next: { body: string; revision: number; savedAt: string }) {
    heldRef.current = false;
    revisionRef.current = next.revision;
    savedBodyRef.current = next.body;
    setRevision(next.revision);
    setSavedBody(next.body);
    setSavedAt(next.savedAt);
    setConflict(false);
    setStatus("saved");
    writeBody(next.body);
  }

  function restoreBackup() {
    if (!backupOffer) return;
    const next = backupOffer.body;
    const older = backupOffer.revision !== revisionRef.current;
    setBackupOffer(null);
    writeTextbookDraftBackup(window.localStorage, code, {
      body: next,
      revision: revisionRef.current,
      savedAt: new Date().toISOString(),
    });
    writeBody(next);
    if (older) markConflict();
  }

  function dismissBackup() {
    setBackupOffer(null);
    writeTextbookDraftBackup(window.localStorage, code, {
      body: bodyRef.current,
      revision: revisionRef.current,
      savedAt: new Date().toISOString(),
    });
  }

  async function takeServer() {
    const current = await loadTextbookDraftAction(code);
    if (!current) {
      setStatus("error");
      return;
    }
    heldRef.current = false;
    revisionRef.current = current.revision;
    savedBodyRef.current = current.body;
    setRevision(current.revision);
    setSavedBody(current.body);
    setSavedAt(current.updatedAt);
    setConflict(false);
    setStatus(current.revision > 0 && current.updatedAt ? "saved" : "idle");
    writeBody(current.body);
  }

  async function overwriteServer() {
    const ok = await askConfirm(t("autosaveOverwriteConfirm"));
    if (!ok) return;
    const current = await loadTextbookDraftAction(code);
    if (!current) {
      setStatus("error");
      return;
    }
    revisionRef.current = current.revision;
    setRevision(current.revision);
    if (current.body === bodyRef.current) {
      savedBodyRef.current = current.body;
      heldRef.current = false;
      setSavedBody(current.body);
      setSavedAt(current.updatedAt);
      setConflict(false);
      setStatus(current.revision > 0 && current.updatedAt ? "saved" : "idle");
      return;
    }
    heldRef.current = false;
    setConflict(false);
    savingRef.current = true;
    setStatus("saving");
    let result: TextbookWriteResult;
    try {
      result = await autosaveTextbookDraftAction({
        code,
        body: bodyRef.current,
        expectedRevision: current.revision,
      });
    } catch {
      result = { ok: false, reason: "error" };
    }
    savingRef.current = false;
    if (!result.ok) {
      if (result.reason === "conflict") markConflict();
      else setStatus(result.reason === "size" ? "size" : "error");
      return;
    }
    const snapshot = bodyRef.current;
    revisionRef.current = result.revision;
    savedBodyRef.current = snapshot;
    setRevision(result.revision);
    setSavedBody(snapshot);
    setSavedAt(result.savedAt);
    setStatus("saved");
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
      const savedFile = await postTextbookImage(file);
      const markerAt = bodyRef.current.indexOf(marker);
      if (!savedFile.ok) {
        setUploadError(savedFile.error);
        if (markerAt !== -1) {
          const cleared = replaceMarkupToken(bodyRef.current, token, "");
          writeBody(cleared);
          start = markerAt;
          end = markerAt;
        }
        setUploading((count) => count - 1);
        continue;
      }
      const markup = textbookImageMarkup(t("imageAlt"), savedFile.src);
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

  const issueText = (issueCode: TextbookLintCode, line: number, detail: string) => {
    if (issueCode === "formula") return t("issueFormula", { line, detail });
    if (issueCode === "fence") return t("issueFence", { line, detail });
    if (issueCode === "fence-end") return t("issueFenceEnd", { line, detail });
    if (issueCode === "image") return t("issueImage", { line });
    if (issueCode === "paper") return t("issuePaper", { line });
    return t("issueMath", { line });
  };

  const visibleIssues = issues.slice(0, ISSUE_LIMIT);
  const locked = conflict || status === "saving" || uploading > 0;

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
      {error === "conflict" ? (
        <p className={css.error} role="alert">
          {t("conflictError")}
        </p>
      ) : null}
      {error === "save" ? (
        <p className={css.error} role="alert">
          {t("autosaveError")}
        </p>
      ) : null}
      {backupOffer ? (
        <div className={css.bannerOn} role="status">
          <p>{t("backupFound")}</p>
          <div className={css.actions}>
            <button className={css.quiet} type="button" onClick={restoreBackup}>
              {t("backupRestore")}
            </button>
            <button className={css.quiet} type="button" onClick={dismissBackup}>
              {t("backupDismiss")}
            </button>
          </div>
        </div>
      ) : null}
      <p className={css.note}>{studentNote}</p>

      <form
        className={css.form}
        action={saveTextbookSectionAction}
        onSubmit={(event) => {
          if (timerRef.current) window.clearTimeout(timerRef.current);
          if (conflict || savingRef.current || uploading > 0) event.preventDefault();
        }}
      >
        <input type="hidden" name="code" value={code} />
        <input type="hidden" name="expectedRevision" value={String(revision)} />
        <div className={css.stage} data-pane={pane}>
          <div className={css.tabs} role="tablist" aria-label={t("panes")} onKeyDown={onToolbarKey}>
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
            {showTemplates ? (
              <div className={css.banner}>
                <p>{isBlankTextbookDraft(body) ? t("templateOffer") : t("templatePick")}</p>
                <p className={css.note}>
                  {suggested === "geometry" ? t("templateHintGeometry") : t("templateHintAlgebra")}
                </p>
                <div className={css.actions}>
                  {(["algebra", "geometry"] as const).map((kind) => (
                    <button
                      key={kind}
                      className={css.tool}
                      type="button"
                      data-suggested={kind === suggested ? "true" : undefined}
                      onClick={() => void applyTemplate(kind)}
                    >
                      {kind === "algebra" ? t("templateAlgebra") : t("templateGeometry")}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className={css.toolbar} role="toolbar" aria-label={t("toolbar")}>
              {SNIPPET_IDS.map((id) => (
                <button key={id} className={css.tool} type="button" onClick={() => insertSnippet(id)}>
                  {t(`insert.${id}`)}
                </button>
              ))}
              <button className={css.tool} type="button" onClick={() => fileRef.current?.click()}>
                {t("pickFile")}
              </button>
              <button
                className={css.tool}
                type="button"
                aria-expanded={showTemplates}
                onClick={() => {
                  if (isBlankTextbookDraft(body)) return;
                  setPickingTemplate((open) => !open);
                }}
              >
                {t("insertTemplate")}
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
        {conflict ? (
          <div className={css.banner} role="alert">
            <p>{t("autosaveConflict")}</p>
            <div className={css.actions}>
              <button className={css.quiet} type="button" onClick={() => void takeServer()}>
                {t("autosaveTake")}
              </button>
              <button className={css.quiet} type="button" onClick={() => void overwriteServer()}>
                {t("autosaveOverwrite")}
              </button>
            </div>
          </div>
        ) : statusLabel ? (
          <p className={status === "error" || status === "size" ? css.error : css.status} role="status" aria-busy={status === "saving" || undefined}>
            {statusLabel}
          </p>
        ) : null}
        <SaveButtons locked={locked} />
      </form>

      <TextbookVersionList
        code={code}
        versions={versions}
        revision={revision}
        locked={locked}
        onRestored={acceptRestored}
        onConflict={markConflict}
      />

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
