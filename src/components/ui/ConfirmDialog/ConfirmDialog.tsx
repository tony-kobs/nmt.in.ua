"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import css from "./ConfirmDialog.module.css";

type PendingConfirm = {
  message: string;
  resolve: (ok: boolean) => void;
};

type ConfirmCopy = {
  confirm: string;
  cancel: string;
  title: string;
};

const COPY: Record<string, ConfirmCopy> = {
  uk: { title: "Підтвердження", confirm: "Підтвердити", cancel: "Скасувати" },
  en: { title: "Confirm", confirm: "Confirm", cancel: "Cancel" },
  de: { title: "Bestätigung", confirm: "Bestätigen", cancel: "Abbrechen" },
};

let setPending: ((next: PendingConfirm | null) => void) | null = null;

/** Modal confirm. Falls back to `window.confirm` if the host is not mounted. */
export function askConfirm(message: string): Promise<boolean> {
  if (!setPending) {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    setPending?.({ message, resolve });
  });
}

/**
 * Form submit that must be confirmed. The first submit opens the dialog;
 * a confirmed `requestSubmit` is allowed through.
 */
export function guardConfirmedSubmit(
  event: { preventDefault(): void; currentTarget: HTMLFormElement },
  message: string,
): void {
  const form = event.currentTarget;
  if (form.dataset.confirmed === "1") {
    delete form.dataset.confirmed;
    return;
  }
  event.preventDefault();
  void askConfirm(message).then((ok) => {
    if (!ok) return;
    form.dataset.confirmed = "1";
    form.requestSubmit();
  });
}

export function ConfirmHost({ locale }: { locale: string }) {
  const [pending, setLocal] = useState<PendingConfirm | null>(null);
  const titleId = useId();
  const copy = COPY[locale] ?? COPY.uk;

  useEffect(() => {
    setPending = setLocal;
    return () => {
      setPending = null;
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        pending.resolve(false);
        setLocal(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  if (!pending || typeof document === "undefined") return null;

  function close(ok: boolean) {
    pending?.resolve(ok);
    setLocal(null);
  }

  return createPortal(
    <div className={css.backdrop} role="presentation" onMouseDown={() => close(false)}>
      <div
        className={css.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className={css.title}>
          {copy.title}
        </h2>
        <p className={css.message}>{pending.message}</p>
        <div className={css.actions}>
          <button type="button" className={css.cancel} onClick={() => close(false)}>
            {copy.cancel}
          </button>
          <button type="button" className={css.confirm} onClick={() => close(true)}>
            {copy.confirm}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
