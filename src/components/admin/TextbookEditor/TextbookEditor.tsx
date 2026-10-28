"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { MaterialDocument } from "@/components/learningMaterials/MaterialDocument";
import type { MaterialContentBlock } from "@/content/learningMaterials/sourceBlocks";
import { saveTextbookSectionAction } from "@/modules/textbook/actions";
import { parseTextbookMarkup } from "@/modules/textbook/markup";
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

function SaveButtons() {
  const t = useTranslations("TextbookEditor");
  const { pending } = useFormStatus();
  return (
    <div className={css.actions}>
      <button
        className={css.quiet}
        type="submit"
        name="intent"
        value="draft"
        disabled={pending}
      >
        {t("saveDraft")}
      </button>
      <button
        className={css.publish}
        type="submit"
        name="intent"
        value="publish"
        disabled={pending}
      >
        {t("publish")}
      </button>
    </div>
  );
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
  const [body, setBody] = useState(initialBody);
  const [synced, setSynced] = useState(initialBody);
  if (initialBody !== synced) {
    setSynced(initialBody);
    setBody(initialBody);
  }
  const blocks = useMemo(() => parseTextbookMarkup(body), [body]);
  const studentNote =
    publishedBody !== null && body === publishedBody
      ? t("seesPublished")
      : publishedBody !== null
        ? t("seesPrevious")
        : body !== staticBody
          ? t("seesStaticDirty")
          : t("seesStatic");

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

      <form className={css.form} action={saveTextbookSectionAction}>
        <input type="hidden" name="code" value={code} />
        <label className={css.label} htmlFor="textbook-body">
          {t("bodyLabel", { name })}
        </label>
        <details className={css.help}>
          <summary>{t("howTo")}</summary>
          <p>{t("howToBody")}</p>
          <pre className={css.sample}>{`:::graph
\\[y = x - 3\\]

| X | -1 | 0 | 1 |
| Y |  |  |  |
:::`}</pre>
        </details>
        <textarea
          id="textbook-body"
          className={css.field}
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          spellCheck={false}
        />
        <SaveButtons />
      </form>

      <section className={css.preview} aria-labelledby="textbook-draft-title">
        <h2 id="textbook-draft-title" className={css.previewTitle}>
          {t("draftPreview")}
        </h2>
        <p className={css.note}>{studentNote}</p>
        {blocks.length > 0 ? (
          <MaterialDocument blocks={blocks} />
        ) : (
          <p className={css.empty}>{t("draftEmpty")}</p>
        )}
      </section>

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
