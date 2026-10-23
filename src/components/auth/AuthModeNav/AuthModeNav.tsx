"use client";

import { useTranslations } from "next-intl";
import clsx from "clsx";
import css from "../auth.module.css";

export type AuthMode = "register" | "login";

type AuthModeNavProps = {
  mode: AuthMode;
  onChange: (mode: AuthMode) => void;
};

/** Same-page switch. The active item is only a brand gradient bar underneath. */
export function AuthModeNav({ mode, onChange }: AuthModeNavProps) {
  const t = useTranslations("AuthShared");
  const items: { id: AuthMode; label: string }[] = [
    { id: "register", label: t("modeRegister") },
    { id: "login", label: t("modeLogin") },
  ];

  return (
    <div className={css.modeNav} role="group" aria-label={t("modeNavLabel")}>
      {items.map((item) => {
        const selected = mode === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={clsx(css.modeTab, selected && css.modeTabActive)}
            aria-pressed={selected}
            onClick={() => onChange(item.id)}
          >
            {item.label}
            {selected ? <span className={css.modeBar} aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}
