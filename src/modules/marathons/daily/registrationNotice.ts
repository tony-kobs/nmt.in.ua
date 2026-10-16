import { renderResolved, type CopyKey } from "./copy";

export type RegistrationNoticeEvent = "register" | "channel" | "link";

export type RegistrationNoticeClaim = {
  marathonId: number;
  userId: number;
  dayNumber: 0;
  kind: "registered";
  channel: "telegram";
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function registrationNoticeClaim(
  marathonId: number,
  userId: number,
): RegistrationNoticeClaim {
  return {
    marathonId,
    userId,
    dayNumber: 0,
    kind: "registered",
    channel: "telegram",
  };
}

/** Once the bot can receive the note. Channel save sends only for Telegram. */
export function registrationNoticeDue(input: {
  event: RegistrationNoticeEvent;
  channel: "site" | "telegram" | null;
  linked: boolean;
}): boolean {
  if (!input.linked) return false;
  if (input.event === "channel") return input.channel === "telegram";
  return input.event === "register" || input.event === "link";
}

export function formatMarathonStartDate(iso: string): string {
  const match = ISO_DATE.exec(iso.trim());
  if (!match) return iso.trim();
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return iso.trim();
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date).replace(/\s*р\.?$/u, "").trim();
}

export function registrationNoticeText(input: {
  copy?: Partial<Record<CopyKey, string>> | null;
  title: string;
  startDate: string;
}): string {
  return renderResolved("bot_registered", input.copy, {
    title: input.title,
    start_date: formatMarathonStartDate(input.startDate),
  });
}

export async function deliverRegistrationNotice(
  input: {
    marathonId: number;
    userId: number;
    title: string;
    startDate: string;
    chatId: string | null;
    copy?: Partial<Record<CopyKey, string>> | null;
    event: RegistrationNoticeEvent;
    channel: "site" | "telegram" | null;
    linked: boolean;
  },
  deps: {
    claim: (key: RegistrationNoticeClaim) => Promise<"claimed" | "duplicate">;
    confirm: (key: RegistrationNoticeClaim) => Promise<void>;
    release: (key: RegistrationNoticeClaim) => Promise<void>;
    send: (chatId: string, text: string) => Promise<boolean>;
  },
): Promise<"sent" | "skipped" | "failed"> {
  if (!registrationNoticeDue(input) || !input.chatId) return "skipped";
  const key = registrationNoticeClaim(input.marathonId, input.userId);
  let claimed: "claimed" | "duplicate";
  try {
    claimed = await deps.claim(key);
  } catch {
    return "failed";
  }
  if (claimed === "duplicate") return "skipped";
  try {
    const sent = await deps.send(input.chatId, registrationNoticeText(input));
    if (!sent) {
      try {
        await deps.release(key);
      } catch {
        // Leave the unconfirmed claim; a later trigger can reclaim it.
      }
      return "failed";
    }
    try {
      await deps.confirm(key);
    } catch {
      // The message already left. A duplicate claim blocks a second send.
    }
    return "sent";
  } catch {
    try {
      await deps.release(key);
    } catch {
      // A later trigger can reclaim a stale unconfirmed row.
    }
    return "failed";
  }
}
