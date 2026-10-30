"use client";

import { useEffect, useState } from "react";
import { listTextbookTaskRefs, type BankTaskView } from "@/modules/textbook/bankTask";
import { missingTaskLint, type TextbookLintIssue } from "@/modules/textbook/lint";

type Lookup = {
  tasks: Record<string, BankTaskView>;
  missing: TextbookLintIssue[];
  /** False while the current set of ids is still loading, so the preview does not warn early. */
  settled: boolean;
};

const EMPTY: Lookup = { tasks: {}, missing: [], settled: true };

export function useBankTaskLookup(source: string): Lookup {
  const key = [...new Set(listTextbookTaskRefs(source).map((item) => item.ref))].sort().join("|");
  const [loaded, setLoaded] = useState<{ key: string; tasks: Record<string, BankTaskView>; missing: TextbookLintIssue[] }>({
    key: "",
    tasks: {},
    missing: [],
  });

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const unique = key.split("|");
    void (async () => {
      try {
        const response = await fetch("/api/admin/textbook-tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refs: unique }),
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          tasks?: Record<string, BankTaskView>;
          missing?: string[];
        };
        if (controller.signal.aborted || !response.ok || !payload.ok || !payload.tasks) return;
        setLoaded({
          key,
          tasks: payload.tasks,
          missing: missingTaskLint(source, payload.missing ?? []),
        });
      } catch {
        if (controller.signal.aborted) return;
      }
    })();
    return () => controller.abort();
  }, [source, key]);

  if (!key) return EMPTY;
  if (loaded.key !== key) return { tasks: {}, missing: [], settled: false };
  return { tasks: loaded.tasks, missing: loaded.missing, settled: true };
}
