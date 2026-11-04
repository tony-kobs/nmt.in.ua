"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  declineMarathonAction,
  joinMarathonAction,
} from "@/modules/marathons/daily/actions";
import {
  listMyNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/modules/notifications/actions";
import type { NotificationSnapshot as UserNotification } from "@/modules/notifications/logic";
import { useTranslations } from "next-intl";
import css from "./NotificationBell.module.css";

export function NotificationBell() {
  const t = useTranslations("Notifications");
  const router = useRouter();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UserNotification[]>([]);
  const [panelBox, setPanelBox] = useState<{ top: number; right: number; maxHeight: number } | null>(
    null,
  );

  function placePanel() {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const top = rect.bottom + 8;
    setPanelBox({
      top,
      right: Math.max(12, window.innerWidth - rect.right),
      maxHeight: Math.max(160, window.innerHeight - top - 16),
    });
  }

  async function refresh() {
    const next = await listMyNotificationsAction();
    setItems(next);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onLayout = () => placePanel();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [open]);

  const unread = items.filter((item) => !item.readAt).length;

  async function openItem(item: UserNotification) {
    if (!item.readAt) {
      await markNotificationReadAction(item.id);
      setItems((current) =>
        current.map((row) =>
          row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row,
        ),
      );
    }
    if (item.kind !== "marathon.invite" && item.link) {
      setOpen(false);
      router.push(item.link);
    }
  }

  async function markAll() {
    await markAllNotificationsReadAction();
    const stamp = new Date().toISOString();
    setItems((current) => current.map((row) => ({ ...row, readAt: row.readAt ?? stamp })));
  }

  return (
    <div className={css.root} ref={rootRef}>
      <button
        type="button"
        className={css.bell}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread > 0 ? t("bellUnread", { count: unread }) : t("bell")}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          placePanel();
          setOpen(true);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden className={css.icon}>
          <path
            d="M12 3a5 5 0 0 0-5 5v2.2c0 .7-.2 1.3-.6 1.9L5 14.2A1 1 0 0 0 5.8 16h12.4a1 1 0 0 0 .8-1.8l-1.4-2.1c-.4-.6-.6-1.2-.6-1.9V8a5 5 0 0 0-5-5Zm0 18a2.4 2.4 0 0 0 2.3-1.8H9.7A2.4 2.4 0 0 0 12 21Z"
            fill="currentColor"
          />
        </svg>
        {unread > 0 ? (
          <span className={css.count}>{unread > 9 ? "9+" : unread}</span>
        ) : null}
      </button>
      {open && panelBox
        ? createPortal(
        <div
          ref={panelRef}
          className={css.panel}
          id={panelId}
          role="region"
          aria-label={t("bell")}
          style={{ top: panelBox.top, right: panelBox.right, maxHeight: panelBox.maxHeight }}
        >
          <div className={css.panelHead}>
            <p className={css.panelTitle}>{t("bell")}</p>
            {unread > 0 ? (
              <button type="button" className={css.markAll} onClick={() => void markAll()}>
                {t("markAll")}
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className={css.empty}>{t("empty")}</p>
          ) : (
            <ul className={css.list}>
              {items.map((item) => (
                <li key={item.id} className={item.readAt ? css.item : css.itemUnread}>
                  <button type="button" className={css.itemButton} onClick={() => void openItem(item)}>
                    <span className={css.itemTitle}>{item.title}</span>
                    <span className={css.itemBody}>{item.body}</span>
                  </button>
                  {item.kind === "marathon.invite" && item.link ? (
                    <div className={css.itemActions}>
                      <form action={joinMarathonAction}>
                        <input type="hidden" name="slug" value={slugFromLink(item.link)} />
                        <button type="submit" className={css.accept}>{t("accept")}</button>
                      </form>
                      <form action={declineMarathonAction}>
                        <input type="hidden" name="slug" value={slugFromLink(item.link)} />
                        <button type="submit" className={css.decline}>{t("decline")}</button>
                      </form>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>,
        document.body,
        )
        : null}
    </div>
  );
}

function slugFromLink(link: string): string {
  const match = /^\/marathon\/([^/?#]+)/.exec(link);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}
