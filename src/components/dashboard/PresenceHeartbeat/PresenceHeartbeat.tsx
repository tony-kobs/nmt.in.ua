"use client";

import { useEffect } from "react";

const HEARTBEAT_MS = 60_000;

/**
 * Keeps the open login session fresh while the cabinet tab is visible.
 * Online = that session is unexpired and active within 5 minutes.
 */
export function PresenceHeartbeat() {
  useEffect(() => {
    let cancelled = false;

    const ping = () => {
      if (cancelled || document.visibilityState === "hidden") return;
      void fetch("/api/presence", {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => {
        /* ignore network blips */
      });
    };

    ping();
    const timer = window.setInterval(ping, HEARTBEAT_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", ping);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", ping);
    };
  }, []);

  return null;
}
