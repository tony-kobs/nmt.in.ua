"use client";

import clsx from "clsx";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FocusEvent } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { switchRoleAction } from "@/modules/auth/switchRoleAction";
import type { UserRole } from "@/modules/auth/client";
import { nextRoleSwitchMotion } from "./roleSwitchMotion";
import css from "./RoleSwitch.module.css";

function subscribeMobile(listener: () => void) {
  const media = window.matchMedia("(max-width: 767px)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

function readMobile() {
  return window.matchMedia("(max-width: 767px)").matches;
}

function useRoleSwitchHidden(enabled: boolean) {
  const mobile = useSyncExternalStore(subscribeMobile, readMobile, () => false);
  const compact = enabled && mobile;
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);
  const anchorY = useRef(0);
  const pinned = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    anchorY.current = window.scrollY;
    const onScroll = () => {
      const y = Math.max(0, window.scrollY);
      const next = pinned.current
        ? { hidden: false, anchorY: y }
        : nextRoleSwitchMotion({
            mobile: window.matchMedia("(max-width: 767px)").matches,
            scrollY: y,
            hidden: hiddenRef.current,
            anchorY: anchorY.current,
          });
      anchorY.current = next.anchorY;
      if (next.hidden === hiddenRef.current) return;
      hiddenRef.current = next.hidden;
      setHidden(next.hidden);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [enabled]);

  useEffect(() => {
    if (compact || !hiddenRef.current) return;
    hiddenRef.current = false;
    setHidden(false);
  }, [compact]);

  return {
    compact,
    hidden: compact && hidden,
    pin() {
      pinned.current = true;
      if (!hiddenRef.current) return;
      hiddenRef.current = false;
      setHidden(false);
    },
    release(event: FocusEvent<HTMLDivElement>) {
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) return;
      pinned.current = false;
    },
  };
}

type RoleSwitchProps = {
  realRole: UserRole;
  effectiveRole: UserRole;
  /** `content` is the strip above the page. `drawer` is the copy inside the mobile menu. */
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
  const motion = useRoleSwitchHidden(variant === "content");

  return (
    <div
      className={css.motion}
      data-compact={motion.compact ? "true" : undefined}
      data-hidden={motion.hidden ? "true" : undefined}
      onFocus={motion.pin}
      onBlur={motion.release}
    >
    <form
      action={switchRoleAction}
      className={clsx(css.bar, variant === "drawer" ? css.barDrawer : css.barContent)}
      data-viewing={viewing ? "true" : undefined}
      inert={motion.hidden ? true : undefined}
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
    </div>
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
