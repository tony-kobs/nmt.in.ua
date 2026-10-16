export type DeliveryChannel = "site" | "telegram";

export function isDeliveryChannel(value: string | null | undefined): value is DeliveryChannel {
  return value === "site" || value === "telegram";
}

/**
 * The two toggles are independent.
 * Pause silences email and Telegram together. The in-site bell is not part of this pair.
 */
export function notifyFlags(input: {
  email: boolean;
  telegram: boolean;
  paused: boolean;
}): { notifyEmail: boolean; notifyBot: boolean } {
  if (input.paused) return { notifyEmail: false, notifyBot: false };
  return {
    notifyEmail: input.email,
    notifyBot: input.telegram,
  };
}

export type NotifyPersonFlags = {
  email: string | null;
  telegramChatId: string | null;
  notifyEmail: boolean;
  notifyBot: boolean;
  paused?: boolean;
  declined?: boolean;
};

/**
 * External delivery for one participant.
 * Email follows its toggle (on by default). Telegram goes to a linked bot when that toggle is on.
 * A decline or a pause sends nothing. Both channels can be on at once.
 */
export function personNotifyChannels(
  person: NotifyPersonFlags,
): Array<"email" | "telegram"> {
  if (person.declined || person.paused) return [];
  const channels: Array<"email" | "telegram"> = [];
  if (person.notifyEmail && person.email) channels.push("email");
  if (person.notifyBot && person.telegramChatId) channels.push("telegram");
  return channels;
}
