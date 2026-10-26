import type { ReactNode } from "react";
import clsx from "clsx";
import css from "./Alert.module.css";

type AlertTone = "error" | "success" | "hint" | "notice";

const TONE = {
  error: css.error,
  success: css.success,
  hint: css.hint,
  notice: css.notice,
} as const;

export function Alert({
  tone,
  children,
  className,
}: {
  tone: AlertTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={clsx(css.base, TONE[tone], className)}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}
