export const NOTIFICATION_CATEGORIES = ["marathon", "news", "system"] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type ChannelPreference = {
  email: boolean;
  telegram: boolean;
};

export type UserChannelPreferences = Record<NotificationCategory, ChannelPreference>;

/**
 * Missing row. Marathon mail stays on, as `notify_email` did.
 * News has no sender yet, so both channels stay off.
 * System Telegram stays on, as task notifications did; there is no system email sender.
 */
export const DEFAULT_CHANNEL_PREFERENCES: UserChannelPreferences = {
  marathon: { email: true, telegram: false },
  news: { email: false, telegram: false },
  system: { email: false, telegram: true },
};

export function isNotificationCategory(value: string): value is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

export function defaultChannelPreferences(): UserChannelPreferences {
  return {
    marathon: { ...DEFAULT_CHANNEL_PREFERENCES.marathon },
    news: { ...DEFAULT_CHANNEL_PREFERENCES.news },
    system: { ...DEFAULT_CHANNEL_PREFERENCES.system },
  };
}

/** In-site bell is not a stored channel. */
export function siteChannelEnabled(): true {
  return true;
}

export function allowsChannel(
  prefs: UserChannelPreferences,
  category: NotificationCategory,
  channel: "email" | "telegram",
): boolean {
  return prefs[category][channel];
}

/** Both external channels off means the marathon category itself is off. */
export function marathonCategoryOff(prefs: UserChannelPreferences): boolean {
  return !prefs.marathon.email && !prefs.marathon.telegram;
}

/**
 * A saved preference row wins over the old participant columns.
 * Without a row, pause still silences both, matching the previous columns.
 */
export function resolveMarathonDelivery(input: {
  columnEmail: boolean;
  columnTelegram: boolean;
  paused: boolean;
  preference: ChannelPreference | null;
}): { notifyEmail: boolean; notifyBot: boolean } {
  if (input.preference) {
    return {
      notifyEmail: input.preference.email,
      notifyBot: input.preference.telegram,
    };
  }
  if (input.paused) return { notifyEmail: false, notifyBot: false };
  return {
    notifyEmail: input.columnEmail,
    notifyBot: input.columnTelegram,
  };
}
