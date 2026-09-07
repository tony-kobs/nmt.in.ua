"use client";

import { useEffect, useState } from "react";
import { markSessionStartedAction } from "@/modules/testing/actions";
import { nowUnixSec } from "@/modules/testing/sessionElapsed";

type UseSessionTimerOptions = {
  sessionId: number;
  enabled: boolean;
  /** Diagnostic sessions use an owner-aware variant of this action. */
  markSessionStarted?: typeof markSessionStartedAction;
};

/**
 * Marks `start_time` on first mount, then ticks elapsed seconds from that
 * unix origin so a page refresh keeps the same clock.
 */
export function useSessionTimer({
  sessionId,
  enabled,
  markSessionStarted = markSessionStartedAction,
}: UseSessionTimerOptions): number {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function startClock() {
      const result = await markSessionStarted({ sessionId });
      if (cancelled) return;

      const originSec =
        result.status === "success" && result.startTime > 0
          ? result.startTime
          : nowUnixSec();

      const tick = () => {
        setElapsedSec(Math.max(0, nowUnixSec() - originSec));
      };
      tick();
      if (cancelled) return;
      intervalId = setInterval(tick, 1000);
    }

    void startClock();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [sessionId, enabled, markSessionStarted]);

  return elapsedSec;
}
