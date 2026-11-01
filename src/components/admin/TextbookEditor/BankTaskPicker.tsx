"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import type { BankKind, BankTaskHit } from "@/modules/textbook/bankTask";
import css from "./TextbookEditor.module.css";

type BankTaskPickerProps = {
  onInsert: (bank: BankKind, id: number) => void;
  onClose: () => void;
};

export function BankTaskPicker({ onInsert, onClose }: BankTaskPickerProps) {
  const t = useTranslations("TextbookEditor");
  const fieldId = useId();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<BankTaskHit[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "empty" | "error">("idle");

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2 && !/^\d+$/.test(text)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState("loading");
      void (async () => {
        try {
          const response = await fetch(`/api/admin/textbook-tasks?q=${encodeURIComponent(text)}`, {
            signal: controller.signal,
          });
          const payload = (await response.json()) as { ok?: boolean; hits?: BankTaskHit[] };
          if (!response.ok || !payload.ok || !payload.hits) {
            setState("error");
            setHits([]);
            return;
          }
          setHits(payload.hits);
          setState(payload.hits.length === 0 ? "empty" : "idle");
        } catch {
          if (controller.signal.aborted) return;
          setState("error");
          setHits([]);
        }
      })();
    }, 280);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className={css.picker}>
      <div className={css.pickerRow}>
        <label className={css.pickerLabel} htmlFor={fieldId}>
          {t("bankSearchLabel")}
        </label>
        <button className={css.tool} type="button" onClick={onClose}>
          {t("bankClose")}
        </button>
      </div>
      <input
        id={fieldId}
        className={css.pickerField}
        value={query}
        placeholder={t("bankSearchPlaceholder")}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
        autoComplete="off"
        spellCheck={false}
      />
      {state === "loading" ? <p className={css.note}>{t("bankSearching")}</p> : null}
      {state === "empty" ? <p className={css.note}>{t("bankSearchEmpty")}</p> : null}
      {state === "error" ? (
        <p className={css.error} role="alert">
          {t("bankSearchFailed")}
        </p>
      ) : null}
      {hits.length > 0 ? (
        <ul className={css.hitList}>
          {hits.map((hit) => (
            <li key={hit.ref}>
              <button className={css.hit} type="button" onClick={() => onInsert(hit.bank, hit.id)}>
                <span className={css.hitTitle}>
                  {hit.bank === "nmt" ? t("bankNmt") : hit.bank === "problem" ? t("bankProblem") : t("bankQuiz")}
                  {" · "}
                  {hit.id}
                  {hit.theme ? ` · ${hit.theme}` : ""}
                </span>
                <span className={css.hitMeta}>{hit.name}</span>
                {hit.excerpt ? <span className={css.hitMeta}>{hit.excerpt}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
