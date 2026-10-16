"use client";

import { useEffect, useState } from "react";
import css from "./marathon.module.css";

export function SavedToast({ active, text }: { active: boolean; text: string }) {
  const [open, setOpen] = useState(active);

  useEffect(() => {
    if (!active) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("saved") === "1") {
      url.searchParams.delete("saved");
      const next = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(null, "", next);
    }
    const id = window.setTimeout(() => setOpen(false), 4200);
    return () => window.clearTimeout(id);
  }, [active]);

  if (!open) return null;
  return (
    <p className={css.toast} role="status">
      {text}
    </p>
  );
}
