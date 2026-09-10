"use client";

import { useEffect, useRef } from "react";
import { upgradeSessionCookieAction } from "@/modules/auth/actions";

/**
 * One-shot: rewrite a legacy session cookie (no displayName/login) so later
 * layouts stop hitting `app_users` on every navigation.
 */
export function UpgradeSessionCookie() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void upgradeSessionCookieAction();
  }, []);

  return null;
}
