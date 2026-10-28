"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { MaterialDocument } from "@/components/learningMaterials/MaterialDocument";
import { saveTextbookSectionAction } from "@/modules/textbook/actions";
import { parseTextbookMarkup } from "@/modules/textbook/markup";
import css from "./TextbookEditor.module.css";

type TextbookEditorProps = {
  code: string;
  name: string;
  initialBody: string;
  saved: "draft" | "published" | null;
  error: string | null;
  publicHref: string;
};

function SaveButtons() {
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
        Зберегти чернетку
      </button>
      <button
        className={css.publish}
        type="submit"
        name="intent"
        value="publish"
        disabled={pending}
      >
        Опублікувати
      </button>
    </div>
  );
}

export function TextbookEditor({
  code,
  name,
  initialBody,
  saved,
  error,
  publicHref,
}: TextbookEditorProps) {
  const [body, setBody] = useState(initialBody);
  const [synced, setSynced] = useState(initialBody);
  if (initialBody !== synced) {
    setSynced(initialBody);
    setBody(initialBody);
  }
  const blocks = useMemo(() => parseTextbookMarkup(body), [body]);

  return (
    <div className={css.wrap}>
      <Link className={css.back} href="/admin/textbook">
        Усі теми
      </Link>
      {saved === "published" ? (
        <p className={css.notice} role="status">
          Опубліковано. Учень уже бачить цей текст.
        </p>
      ) : null}
      {saved === "draft" ? (
        <p className={css.notice} role="status">
          Чернетку збережено. На сайті лишається попередня опублікована версія.
        </p>
      ) : null}
      {error === "size" ? (
        <p className={css.error} role="alert">
          Текст задовгий. Скоротіть розділ і збережіть ще раз.
        </p>
      ) : null}

      <form className={css.form} action={saveTextbookSectionAction}>
        <input type="hidden" name="code" value={code} />
        <label className={css.label} htmlFor="textbook-body">
          Текст теми «{name}»
        </label>
        <details className={css.help}>
          <summary>Як писати</summary>
          <p>
            Порожній рядок відділяє абзаци. Заголовок — <code># </code>,
            підзаголовок — <code>## </code>, пункт — <code>- </code>. Жирний —
            {" "}
            <code>**так**</code>, формула в рядку — <code>{"\\(x^2\\)"}</code>,
            формула окремо — <code>{"\\[y = x\\]"}</code>. Картинка —{" "}
            <code>{"![підпис](/materials/source/…)"}</code>. Таблиця — рядки{" "}
            <code>| клітина | клітина |</code>. Клітинка для графіка:
          </p>
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

      <section className={css.preview} aria-labelledby="textbook-preview-title">
        <div className={css.previewHead}>
          <h2 id="textbook-preview-title" className={css.previewTitle}>
            Як побачить учень
          </h2>
          <a className={css.publicLink} href={publicHref}>
            Відкрити тему в підручнику
          </a>
        </div>
        {blocks.length > 0 ? (
          <MaterialDocument blocks={blocks} />
        ) : (
          <p className={css.empty}>Порожньо. Після публікації учень побачить «Матеріал готується».</p>
        )}
      </section>
    </div>
  );
}
