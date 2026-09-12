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

export type UseSessionTimerResult = {
  elapsedSec: number;
  /** True once the server reports this session's 24h deadline has passed —
   * the local clock stops ticking for a session that is no longer live. */
  expired: boolean;
};

/**
 * Marks `start_time` on first mount, then ticks elapsed seconds from that
 * unix origin so a page refresh keeps the same clock.
 */
export function useSessionTimer({
  sessionId,
  enabled,
  markSessionStarted = markSessionStartedAction,
}: UseSessionTimerOptions): UseSessionTimerResult {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function startClock() {
      const result = await markSessionStarted({ sessionId });
      if (cancelled) return;

      if (result.status === "error" && result.code === "sessionExpired") {
        setExpired(true);
        return;
      }

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

  return { elapsedSec, expired };
}
