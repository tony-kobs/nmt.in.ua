"use client";

import { useTranslations } from "next-intl";
import clsx from "clsx";
import css from "../auth.module.css";

export type RegisterRole = "student" | "teacher";

type RegisterRolePickerProps = {
  role: RegisterRole;
  onSelect: (role: RegisterRole) => void;
  /** `aside` — under marketing copy (1240+). `card` — inside the form. */
  placement: "aside" | "card";
};

export function RegisterRolePicker({
  role,
  onSelect,
  placement,
}: RegisterRolePickerProps) {
  const t = useTranslations("RegisterForm");
  const options: { id: RegisterRole; label: string }[] = [
    { id: "student", label: t("roleStudent") },
    { id: "teacher", label: t("roleTeacher") },
  ];

  return (
    <div
      className={clsx(
        css.rolePicker,
        placement === "aside" ? css.rolePickerAside : css.rolePickerCard,
      )}
      role="group"
      aria-label={t("roleLabel")}
    >
      <p className={css.rolePickerLabel}>{t("roleLabel")}</p>
      <div className={css.rolePickerTabs}>
        {options.map((option) => {
          const selected = role === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className={clsx(css.roleTab, selected && css.roleTabActive)}
              aria-pressed={selected}
              onClick={() => onSelect(option.id)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
