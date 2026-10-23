import { performMarathonNotificationTick } from "./cronRoute";
import { marathonNotifyGate } from "./notifyLock";

export const SCHEDULER_INTERVAL_MS = 60_000;

const globalState = globalThis as typeof globalThis & {
  __nmtMarathonScheduler?: boolean;
};

/** Production default is on. Dev and tests stay off unless the flag is `on`. */
export function marathonSchedulerEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const flag = env.MARATHON_SCHEDULER?.trim().toLowerCase();
  if (flag === "on") return true;
  if (flag === "off") return false;
  return env.NODE_ENV === "production";
}

export function resetMarathonSchedulerForTests(): void {
  delete globalState.__nmtMarathonScheduler;
}

/**
 * One interval per process. The first tick runs immediately so a restart
 * does not wait a minute. Errors stay inside the tick.
 */
export function startMarathonScheduler(options?: {
  enabled?: boolean;
  tick?: () => Promise<void>;
  schedule?: (fn: () => void, ms: number) => { unref?: () => void };
}): boolean {
  if (process.env.NEXT_PHASE === "phase-production-build") return false;
  const enabled = options?.enabled ?? marathonSchedulerEnabled();
  if (!enabled) return false;
  if (globalState.__nmtMarathonScheduler) return false;
  globalState.__nmtMarathonScheduler = true;
  const tick = options?.tick ?? runSchedulerTick;
  const schedule = options?.schedule ?? ((fn, ms) => {
    const timer = setInterval(fn, ms);
    return timer;
  });
  const fire = () => {
    void tick().catch((error: unknown) => {
      console.error("marathon scheduler", error);
    });
  };
  const timer = schedule(fire, SCHEDULER_INTERVAL_MS);
  timer.unref?.();
  fire();
  return true;
}

async function runSchedulerTick(): Promise<void> {
  try {
    await marathonNotifyGate().run(() => performMarathonNotificationTick("scheduler"));
  } catch (error) {
    console.error("marathon scheduler", error);
  }
}
