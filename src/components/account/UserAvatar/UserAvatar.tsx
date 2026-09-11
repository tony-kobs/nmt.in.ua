import clsx from "clsx";
import type { AuthUser } from "@/modules/auth/client";
import { avatarSrc, userInitials } from "@/modules/auth/client";
import css from "./UserAvatar.module.css";

type UserAvatarProps = {
  user: AuthUser;
  className?: string;
};

export function UserAvatar({ user, className }: UserAvatarProps) {
  const src = avatarSrc(user);
  return (
    <span className={clsx(css.face, className)} aria-hidden>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- per-user API blob, not a static asset
        <img className={css.photo} src={src} alt="" />
      ) : (
        userInitials(user.displayName)
      )}
    </span>
  );
}
