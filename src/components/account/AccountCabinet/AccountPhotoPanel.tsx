"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import type { AuthUser } from "@/modules/auth/client";
import { avatarSrc } from "@/modules/auth/client";
import {
  removeAvatarAction,
  uploadAvatarAction,
  type UploadAvatarActionState,
} from "@/modules/auth/actions";
import { AVATAR_ACCEPT, AVATAR_MAX_BYTES } from "@/modules/auth/avatarConstants";
import { UserAvatar } from "@/components/account/UserAvatar";
import { cropAvatarFile } from "./cropAvatar";
import css from "./AccountCabinet.module.css";

const INITIAL: UploadAvatarActionState = { status: "idle" };

type AccountPhotoPanelProps = {
  user: AuthUser;
  demoLocked: boolean;
};

export function AccountPhotoPanel({ user, demoLocked }: AccountPhotoPanelProps) {
  const t = useTranslations("AccountCabinet");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadState, uploadAction, uploadPending] = useActionState(
    uploadAvatarAction,
    INITIAL,
  );
  const [handledUploadState, setHandledUploadState] =
    useState<UploadAvatarActionState>(uploadState);
  const [removeState, removeAction, removePending] = useActionState(
    removeAvatarAction,
    INITIAL,
  );

  const pending = uploadPending || removePending;
  const savedSrc = avatarSrc(user);
  const preview = previewUrl ?? savedSrc;

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (uploadState.status === "ok" || removeState.status === "ok") {
      router.refresh();
    }
  }, [uploadState, removeState, router]);

  if (uploadState !== handledUploadState) {
    setHandledUploadState(uploadState);
    if (uploadState.status === "ok") {
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    }
  }

  useEffect(() => {
    if (uploadState.status === "ok" && inputRef.current) {
      inputRef.current.value = "";
    }
  }, [uploadState]);

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) {
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      return;
    }

    const cropped = await cropAvatarFile(file);
    const dt = new DataTransfer();
    dt.items.add(cropped);
    input.files = dt.files;
    const url = URL.createObjectURL(cropped);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return url;
    });
  }

  const maxKb = Math.round(AVATAR_MAX_BYTES / 1024);
  const errorState =
    uploadState.status === "error"
      ? uploadState
      : removeState.status === "error"
        ? removeState
        : null;

  return (
    <section className={css.panel} aria-labelledby="account-photo-title">
      <div>
        <h2 id="account-photo-title" className={css.panelTitle}>
          {t("photoTitle")}
        </h2>
        <p className={css.panelLead}>{t("photoLead")}</p>
      </div>

      {demoLocked ? (
        <p className={clsx(css.alert, css.alertHint)} role="status">
          {t("demoLockedPhoto")}
        </p>
      ) : null}

      {errorState ? (
        <p className={clsx(css.alert, css.alertError)} role="alert">
          {t(`photoErrors.${errorState.code}`)}
        </p>
      ) : null}

      {uploadState.status === "ok" ? (
        <p className={clsx(css.alert, css.alertSuccess)} role="status">
          {t("photoSaved")}
        </p>
      ) : null}

      {removeState.status === "ok" ? (
        <p className={clsx(css.alert, css.alertSuccess)} role="status">
          {t("photoRemoved")}
        </p>
      ) : null}

      <div className={css.photoRow}>
        <span className={css.photoPreview} aria-hidden>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview or per-user API blob
            <img className={css.photoPreviewImg} src={preview} alt="" />
          ) : (
            <UserAvatar user={user} className={css.photoPreviewFace} />
          )}
        </span>

        <div className={css.photoControls}>
          <form className={css.photoForm} action={uploadAction}>
            <label className={css.field}>
              <span className={css.label}>{t("photoChoose")}</span>
              <input
                ref={inputRef}
                className={css.file}
                type="file"
                name="avatar"
                accept={AVATAR_ACCEPT}
                required
                disabled={demoLocked || pending}
                onChange={onPick}
              />
              <span className={css.hint}>{t("photoHint", { maxKb })}</span>
            </label>
            <button
              type="submit"
              className={css.submit}
              disabled={demoLocked || pending}
            >
              {uploadPending ? t("photoSaving") : t("photoSave")}
            </button>
          </form>

          {savedSrc ? (
            <form action={removeAction}>
              <button
                type="submit"
                className={css.logout}
                disabled={demoLocked || pending}
              >
                {removePending ? t("photoRemoving") : t("photoRemove")}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </section>
  );
}
