export type SendOutcome = { ok: true } | { ok: false; retryAfter?: number };

export type TelegramPace = {
  globalTimes: number[];
  chatAt: Map<string, number>;
};

const sharedPace: TelegramPace = { globalTimes: [], chatAt: new Map() };

/** One limiter per serverless instance, shared by the webhook and the cron. */
export function sharedTelegramPace(): TelegramPace {
  return sharedPace;
}

export type ThrottleOptions<T> = {
  chatId: (item: T) => string;
  send: (item: T) => Promise<SendOutcome>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  budgetMs?: number;
  startedAt?: number;
  /** Telegram allows about 30 messages per second across chats. */
  globalPerSecond?: number;
  /** Gap inside one chat. Short bursts stay under a second; 429 still backs off. */
  perChatGapMs?: number;
  pace?: TelegramPace;
};

/**
 * Send in order. A 429 waits for retry_after when the budget allows.
 * Anything that would miss the budget is returned unsent, in order.
 */
export async function sendThrottled<T>(
  items: T[],
  options: ThrottleOptions<T>,
): Promise<{ sent: T[]; deferred: T[] }> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const budgetMs = options.budgetMs ?? 8_000;
  const startedAt = options.startedAt ?? now();
  const globalPerSecond = options.globalPerSecond ?? 25;
  const perChatGapMs = options.perChatGapMs ?? 50;
  const pace: TelegramPace = options.pace ?? { globalTimes: [], chatAt: new Map() };
  const globalTimes = pace.globalTimes;
  const chatAt = pace.chatAt;
  const sent: T[] = [];
  const deferred: T[] = [];

  const overBudget = (extraMs: number) => now() + extraMs - startedAt > budgetMs;

  const wait = async (ms: number): Promise<boolean> => {
    if (ms <= 0) return true;
    if (overBudget(ms)) return false;
    await sleep(ms);
    return true;
  };

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    const chatId = options.chatId(item);
    if (overBudget(0)) {
      deferred.push(...items.slice(index));
      break;
    }
    const stamp = now();
    while (globalTimes.length > 0 && globalTimes[0]! <= stamp - 1000) globalTimes.shift();
    if (globalTimes.length >= globalPerSecond) {
      const delay = globalTimes[0]! + 1000 - stamp;
      if (!(await wait(delay))) {
        deferred.push(...items.slice(index));
        break;
      }
    }
    const previous = chatAt.get(chatId);
    if (previous != null) {
      const delay = perChatGapMs - (now() - previous);
      if (!(await wait(delay))) {
        deferred.push(...items.slice(index));
        break;
      }
    }
    let outcome = await options.send(item);
    if (!outcome.ok && outcome.retryAfter != null) {
      const delay = Math.max(0, outcome.retryAfter) * 1000;
      if (!(await wait(delay))) {
        deferred.push(...items.slice(index));
        break;
      }
      outcome = await options.send(item);
    }
    const sentAt = now();
    globalTimes.push(sentAt);
    chatAt.set(chatId, sentAt);
    if (!outcome.ok) continue;
    sent.push(item);
  }
  return { sent, deferred };
}
