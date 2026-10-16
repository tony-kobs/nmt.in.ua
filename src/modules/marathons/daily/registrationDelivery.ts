import "server-only";

import { notifyUser } from "@/modules/notifications/store";
import { getTelegramLinkRecord } from "@/modules/telegram/link";
import {
  claimNotification,
  confirmNotification,
  getDailyById,
  getParticipant,
  loadMarathonCopy,
  releaseNotification,
} from "./store";
import {
  deliverRegistrationNotice,
  formatMarathonStartDate,
  type RegistrationNoticeEvent,
} from "./registrationNotice";

const CHAT_ID = /^[1-9][0-9]{0,19}$/;

function usableChatId(value: string | null | undefined): string | null {
  if (!value || !CHAT_ID.test(value)) return null;
  return value;
}

async function sendRegistrationTelegram(chatId: string, text: string): Promise<boolean> {
  const { optionalTelegramBot } = await import("./botLink");
  const { sendTelegramMessage } = await import("@/modules/telegram/transport");
  const bot = optionalTelegramBot();
  if (!bot) return false;
  const result = await sendTelegramMessage({ chatId, text }, bot.token);
  return result.status === "sent";
}

/**
 * Telegram confirmation of a marathon registration.
 * A send failure is swallowed: joining, saving a channel, and linking the bot
 * must still succeed.
 */
export async function notifyMarathonRegistration(input: {
  marathonId: number;
  userId: number;
  event: RegistrationNoticeEvent;
  channel?: "site" | "telegram" | null;
  chatId?: string | null;
}): Promise<void> {
  if (!process.env.DB_HOST) return;
  try {
    const marathon = await getDailyById(input.marathonId);
    if (!marathon) return;
    const participant = await getParticipant(marathon.id, input.userId);
    if (!participant) return;
    const account = await getTelegramLinkRecord(input.userId).catch(() => null);
    const chatId = usableChatId(input.chatId)
      ?? usableChatId(participant.telegramChatId)
      ?? usableChatId(account?.chatId);
    const copy = await loadMarathonCopy(marathon.id);
    if (input.event === "register") {
      await notifyUser({
        userId: input.userId,
        kind: "marathon.registered",
        title: "Реєстрацію підтверджено",
        body: `Ви в марафоні «${marathon.title}». Старт: ${formatMarathonStartDate(marathon.startDate)}. Дні можна проходити на сайті і в Telegram.`,
        link: `/marathon/${marathon.slug}/map`,
        once: true,
      });
    }
    await deliverRegistrationNotice(
      {
        marathonId: marathon.id,
        userId: input.userId,
        title: marathon.title,
        startDate: marathon.startDate,
        chatId,
        copy,
        event: input.event,
        channel: input.channel !== undefined ? input.channel : participant.channel,
        linked: Boolean(chatId),
      },
      {
        claim: (key) => claimNotification(key),
        confirm: (key) => confirmNotification(key),
        release: (key) => releaseNotification(key),
        send: sendRegistrationTelegram,
      },
    );
  } catch (error) {
    console.error("marathon registration telegram", error);
  }
}
