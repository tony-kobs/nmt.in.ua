export type DeliveryChannel = "site" | "telegram";

export function isDeliveryChannel(value: string | null | undefined): value is DeliveryChannel {
  return value === "site" || value === "telegram";
}

/**
 * How reminders leave the server.
 * Telegram without a linked bot falls back to email until `linked` is true.
 * Pause silences both. A missing choice keeps the historical email default.
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
