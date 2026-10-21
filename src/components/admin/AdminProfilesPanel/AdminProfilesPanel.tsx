"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { roleLabel, type UserRole, USER_ROLES } from "@/modules/auth/client";
import { queryHref } from "@/lib/queryHref";
import {
  deleteProfileAction,
  promotePlatformStudentAction,
  setProfileBannedAction,
  type ProfileModerationActionState,
} from "@/modules/admin-profiles/actions";
import type { AdminProfile, AdminProfilesPage } from "@/modules/admin-profiles/types";
import { formatKyivDateTime, formatRelativeAgo } from "@/lib/relativeTime";
import css from "./AdminProfilesPanel.module.css";

const BAN_INITIAL: ProfileModerationActionState = { status: "idle" };
const DELETE_INITIAL: ProfileModerationActionState = { status: "idle" };

type RoleFilter = "all" | UserRole;

type AdminProfilesPanelProps = {
  profilesPage: AdminProfilesPage;
  currentUserId: number;
  roleFilter?: RoleFilter;
};

function formatCreatedAt(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  }).format(date);
}

function presenceText(
  profile: Pick<AdminProfile, "isOnline" | "seenMinutesAgo">,
  locale: string,
  onlineLabel: string,
  neverLabel: string,
): string {
  if (profile.isOnline) return onlineLabel;
  return formatRelativeAgo(profile.seenMinutesAgo, locale) ?? neverLabel;
}

function profilesHref(role: RoleFilter, page: number): string {
  return queryHref("/profiles", {
    role: role === "all" ? null : role,
    page: page > 1 ? String(page) : null,
  });
}

export function AdminProfilesPanel({
  profilesPage,
  currentUserId,
  roleFilter = "all",
}: AdminProfilesPanelProps) {
  const t = useTranslations("AdminProfiles");
  const router = useRouter();
  const [banState, banAction, banPending] = useActionState(
    setProfileBannedAction,
    BAN_INITIAL,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteProfileAction,
    DELETE_INITIAL,
  );
  const [promoteState, promoteAction, promotePending] = useActionState(
    promotePlatformStudentAction,
    BAN_INITIAL,
  );

  const pending = banPending || deletePending || promotePending;
  const flash =
    banState.status !== "idle"
      ? banState
      : deleteState.status !== "idle"
        ? deleteState
        : promoteState;
  const { items, page, totalPages, total, roleCounts } = profilesPage;
  const showPager = totalPages > 1;

  useEffect(() => {
    if (
      banState.status === "success" ||
      deleteState.status === "success" ||
      promoteState.status === "success"
    ) {
      router.refresh();
    }
  }, [banState, deleteState, promoteState, router]);

  const locale =
    typeof document !== "undefined"
      ? document.documentElement.lang || "uk"
      : "uk";

  return (
    <div className={css.layout}>
      <section className={css.panel} aria-labelledby="admin-profiles-title">
        <div>
          <h2 id="admin-profiles-title" className={css.panelTitle}>
            {t("listTitle")}
          </h2>
          <p className={css.panelLead}>{t("listLead")}</p>
        </div>

        <div
          className={css.filters}
          role="group"
          aria-label={t("filterLabel")}
        >
          <button
            type="button"
            className={clsx(
              css.filterChip,
              roleFilter === "all" && css.filterChipActive,
            )}
            aria-pressed={roleFilter === "all"}
            onClick={() =>
              router.replace(profilesHref("all", 1), { scroll: false })
            }
          >
            {t("filterAll", { count: roleCounts.all })}
          </button>
          {USER_ROLES.map((role) => (
            <button
              key={role}
              type="button"
              className={clsx(
                css.filterChip,
                roleFilter === role && css.filterChipActive,
              )}
              aria-pressed={roleFilter === role}
              onClick={() =>
                router.replace(profilesHref(role, 1), { scroll: false })
              }
            >
              {t("filterRole", {
                role: roleLabel(role),
                count: roleCounts[role],
              })}
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <p className={css.empty}>
            {roleCounts.all === 0 ? t("empty") : t("emptyFilter")}
          </p>
        ) : (
          <>
            <ul className={css.list}>
              {items.map((profile) => {
                const isSelf = profile.id === currentUserId;
                const canModerate = !isSelf;

                return (
                  <li
                    key={profile.id}
                    className={clsx(
                      css.item,
                      profile.isBanned && css.itemBanned,
                    )}
                  >
                    <div className={css.identity}>
                      <p className={css.name}>
                        {profile.displayName}
                        <span
                          className={clsx(
                            css.presence,
                            profile.isOnline
                              ? css.presenceOnline
                              : css.presenceOffline,
                            !profile.isOnline && css.presenceAgo,
                          )}
                          title={
                            profile.lastSeenAt
                              ? formatKyivDateTime(profile.lastSeenAt, locale)
                              : undefined
                          }
                        >
                          <span className={css.presenceDot} aria-hidden />
                          {presenceText(profile, locale, t("online"), t("never"))}
                        </span>
                        {isSelf ? (
                          <span className={css.you}>{t("you")}</span>
                        ) : null}
                        {profile.isBanned ? (
                          <span className={css.banned}>{t("bannedBadge")}</span>
                        ) : null}
                        {profile.cabinetScope === "marathon" ? (
                          <span className={css.scopeBadge}>{t("marathonOnlyBadge")}</span>
                        ) : null}
                      </p>
                      <p className={css.login}>@{profile.login}</p>
                      <p className={css.meta}>
                        {profile.email
                          ? t("emailMeta", { email: profile.email })
                          : t("emailMissing")}
                        {" · "}
                        {profile.emailVerified
                          ? t("emailVerified")
                          : t("emailUnverified")}
                      </p>
                      <p className={css.meta}>
                        {t("roleMeta", { role: roleLabel(profile.role) })}
                        {" · "}
                        {t("lastLoginMeta", {
                          date: profile.lastLoginAt
                            ? formatKyivDateTime(profile.lastLoginAt, locale)
                            : t("never"),
                        })}
                      </p>
                      <p className={css.meta}>
                        {t("lastSeenMeta", {
                          date: profile.lastSeenAt
                            ? formatKyivDateTime(profile.lastSeenAt, locale)
                            : t("never"),
                        })}
                        {" · "}
                        {t("createdMeta", {
                          date: formatCreatedAt(profile.createdAt, locale),
                        })}
                      </p>
                    </div>

                    {canModerate ? (
                      <div className={css.actions}>
                        <form
                          action={banAction}
                          onSubmit={(event) => {
                            const message = profile.isBanned
                              ? t("unbanConfirm", {
                                  name: profile.displayName,
                                })
                              : t("banConfirm", {
                                  name: profile.displayName,
                                });
                            if (!window.confirm(message)) {
                              event.preventDefault();
                            }
                          }}
                        >
                          <input
                            type="hidden"
                            name="userId"
                            value={profile.id}
                          />
                          <input
                            type="hidden"
                            name="banned"
                            value={profile.isBanned ? "0" : "1"}
                          />
                          <button
                            type="submit"
                            className={clsx(
                              css.actionBtn,
                              profile.isBanned
                                ? css.actionUnban
                                : css.actionBan,
                            )}
                            disabled={pending}
                          >
                            {profile.isBanned ? t("unban") : t("ban")}
                          </button>
                        </form>
                        {profile.role === "student" &&
                        profile.cabinetScope === "marathon" ? (
                          <form
                            action={promoteAction}
                            onSubmit={(event) => {
                              if (
                                !window.confirm(
                                  t("promoteConfirm", {
                                    name: profile.displayName,
                                  }),
                                )
                              ) {
                                event.preventDefault();
                              }
                            }}
                          >
                            <input type="hidden" name="userId" value={profile.id} />
                            <button
                              type="submit"
                              className={clsx(css.actionBtn, css.actionUnban)}
                              disabled={pending}
                            >
                              {t("promote")}
                            </button>
                          </form>
                        ) : null}
                        <form
                          action={deleteAction}
                          onSubmit={(event) => {
                            if (
                              !window.confirm(
                                t("deleteConfirm", {
                                  name: profile.displayName,
                                }),
                              )
                            ) {
                              event.preventDefault();
                            }
                          }}
                        >
                          <input
                            type="hidden"
                            name="userId"
                            value={profile.id}
                          />
                          <button
                            type="submit"
                            className={clsx(css.actionBtn, css.actionDelete)}
                            disabled={pending}
                          >
                            {t("delete")}
                          </button>
                        </form>
                      </div>
                    ) : (
                      <p className={css.lockedHint}>
                        {isSelf ? t("selfLocked") : t("protectedLocked")}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>

            {showPager ? (
              <nav className={css.pager} aria-label={t("pagerAria")}>
                {page > 1 ? (
                  <Link
                    href={profilesHref(roleFilter, page - 1)}
                    className={css.pagerBtn}
                  >
                    ← {t("prevPage")}
                  </Link>
                ) : (
                  <span className={clsx(css.pagerBtn, css.pagerBtnDisabled)}>
                    ← {t("prevPage")}
                  </span>
                )}
                <p className={css.pagerStatus}>
                  {t("pageStatus", { page, totalPages, total })}
                </p>
                {page < totalPages ? (
                  <Link
                    href={profilesHref(roleFilter, page + 1)}
                    className={css.pagerBtn}
                  >
                    {t("nextPage")} →
                  </Link>
                ) : (
                  <span className={clsx(css.pagerBtn, css.pagerBtnDisabled)}>
                    {t("nextPage")} →
                  </span>
                )}
              </nav>
            ) : null}
          </>
        )}

        {flash.status === "success" ? (
          <p className={clsx(css.alert, css.alertSuccess)} role="status">
            {t(`success.${flash.action}`, { name: flash.displayName })}
          </p>
        ) : null}
        {flash.status === "error" ? (
          <p className={clsx(css.alert, css.alertError)} role="alert">
            {t(`errors.${flash.code}`)}
          </p>
        ) : null}
      </section>
    </div>
  );
}
