"use client";

import { useState, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import css from "../auth.module.css";

type PasswordInputProps = Omit<
  ComponentProps<"input">,
  "type" | "className" | "spellCheck"
>;

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {hidden ? (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.9 5.1A10.8 10.8 0 0 1 12 5c5 0 9.3 3.1 11 7a11.8 11.8 0 0 1-4.2 5.2" />
          <path d="M6.1 6.1C3.8 7.6 2.2 9.6 1 12c1.7 3.9 6 7 10.5 7 1.4 0 2.8-.3 4-.8" />
        </>
      ) : (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

/** Password field with a button that reveals the typed value. */
export function PasswordInput(props: PasswordInputProps) {
  const t = useTranslations("AuthShared");
  const [visible, setVisible] = useState(false);

  return (
    <span className={css.passwordWrap}>
      <input
        {...props}
        className={`${css.input} ${css.passwordInput}`}
        type={visible ? "text" : "password"}
        spellCheck={false}
      />
      <button
        type="button"
        className={css.passwordToggle}
        aria-label={visible ? t("hidePassword") : t("showPassword")}
        aria-pressed={visible}
        disabled={props.disabled}
        onClick={() => setVisible((current) => !current)}
      >
        <EyeIcon hidden={visible} />
      </button>
    </span>
  );
}
