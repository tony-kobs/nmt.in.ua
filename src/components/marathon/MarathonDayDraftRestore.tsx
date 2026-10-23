"use client";

import { useEffect } from "react";
import {
  MARATHON_DAY_FORM_ID,
  MARATHON_DRAFT_KEY,
  readMarathonDraft,
} from "@/lib/deploymentSkew";

/** Puts unsubmitted day answers back after a one-time skew reload. */
export function MarathonDayDraftRestore() {
  useEffect(() => {
    const href = `${window.location.pathname}${window.location.search}`;
    const answers = readMarathonDraft(window.sessionStorage.getItem(MARATHON_DRAFT_KEY), href);
    window.sessionStorage.removeItem(MARATHON_DRAFT_KEY);
    if (!answers) return;
    const form = document.getElementById(MARATHON_DAY_FORM_ID);
    if (!(form instanceof HTMLFormElement)) return;
    for (const [name, value] of Object.entries(answers)) {
      const input = form.querySelector<HTMLInputElement>(
        `input[type="radio"][name="${CSS.escape(name)}"][value="${CSS.escape(value)}"]`,
      );
      if (input) input.checked = true;
    }
  }, []);
  return null;
}
