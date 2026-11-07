"use client";

import clsx from "clsx";
import { useId } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { switchRoleAction } from "@/modules/auth/switchRoleAction";
import type { UserRole } from "@/modules/auth/client";
import css from "./RoleSwitch.module.css";

type RoleSwitchProps = {
  realRole: UserRole;
  effectiveRole: UserRole;
  /** `content` sits above the page from 768. `drawer` is the mobile menu copy. */
  variant?: "content" | "drawer";
};

export function RoleSwitch({
  realRole,
  effectiveRole,
  variant = "content",
}: RoleSwitchProps) {
  const t = useTranslations("Header");
  const statusId = useId();
  const viewing = effectiveRole !== realRole;
  const realLabel = t(`roles.${realRole}`);
  const effectiveLabel = t(`roles.${effectiveRole}`);

  return (
    <form
      action={switchRoleAction}
      className={clsx(css.bar, variant === "drawer" ? css.barDrawer : css.barContent)}
      data-viewing={viewing ? "true" : undefined}
    >
      <p id={statusId} className={css.status} role="status">
        {viewing
          ? t("roleSwitchStatus", { role: effectiveLabel, real: realLabel })
          : t("roleSwitchIdle")}
      </p>
      <div className={css.choices} role="group" aria-labelledby={statusId}>
        <RoleChoice
          value="student"
          pressed={effectiveRole === "student"}
          label={t("roleSwitchStudent")}
        />
        <RoleChoice
          value="teacher"
          pressed={effectiveRole === "teacher"}
          label={t("roleSwitchTeacher")}
        />
        <RoleChoice
          value="self"
          pressed={!viewing}
          emphasize={viewing}
          label={t("roleSwitchSelf", { role: realLabel })}
        />
      </div>
    </form>
  );
}

function RoleChoice({
  value,
  pressed,
  label,
  emphasize = false,
}: {
  value: string;
  pressed: boolean;
  label: string;
  emphasize?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="role"
      value={value}
      className={clsx(css.choice, emphasize && css.choiceReturn)}
      aria-pressed={pressed}
      disabled={pending || pressed}
    >
      {label}
    </button>
  );
}
