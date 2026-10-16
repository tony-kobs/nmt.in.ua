export type DeliveryChannel = "site" | "telegram";

export function isDeliveryChannel(value: string | null | undefined): value is DeliveryChannel {
  return value === "site" || value === "telegram";
}

/**
 * How reminders leave the server.
 * Telegram without a linked bot falls back to email until `linked` is true.
 * Pause silences both. A missing choice keeps the historical email default.
 * The two flags are exclusive: a stored pair of 1s must not send twice.
 */
export function notifyFlags(input: {
  channel: DeliveryChannel | null;
  linked: boolean;
  paused: boolean;
}): { notifyEmail: boolean; notifyBot: boolean } {
  if (input.paused) return { notifyEmail: false, notifyBot: false };
  if (input.channel === "telegram") {
    return input.linked
      ? { notifyEmail: false, notifyBot: true }
      : { notifyEmail: true, notifyBot: false };
  }
  if (input.channel === "site") return { notifyEmail: true, notifyBot: false };
  return { notifyEmail: true, notifyBot: false };
}

/**
 * One delivery channel per participant.
 * Telegram is used only when that channel is chosen (or is the only enabled flag) and a chat is linked.
 * Email is the site choice, the unlinked-telegram fallback, or the legacy default.
 * Both flags on still yields a single channel.
 */
export function personNotifyChannel(person: {
  channel?: DeliveryChannel | null;
  email: string | null;
  telegramChatId: string | null;
  notifyEmail: boolean;
  notifyBot: boolean;
}): "email" | "telegram" | null {
  const paused = !person.notifyEmail && !person.notifyBot;
  const linked = Boolean(person.telegramChatId);
  if (person.channel === "telegram") {
    if (paused) return null;
    return linked ? "telegram" : person.email ? "email" : null;
  }
  if (person.channel === "site") {
    if (paused) return null;
    return person.email ? "email" : null;
  }
  if (person.notifyBot && linked) return "telegram";
  if (person.notifyEmail && person.email) return "email";
  return null;
}
