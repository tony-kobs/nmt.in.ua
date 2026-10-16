import "server-only";

import { notifyUser } from "@/modules/notifications/store";
import type { HomeMarathonCard } from "./homeCard";
import type { MarathonInvite } from "./invite";
import { loadMarathonHomeState } from "./store";

export function inviteNotification(invite: MarathonInvite): {
  kind: string;
  title: string;
  body: string;
  link: string;
} {
  return {
    kind: "marathon.invite",
    title: `Запрошення: ${invite.title}`,
    body: `Марафон «${invite.title}» уже активний. Можна приєднатися або відмовитися.`,
    link: `/marathon/${invite.slug}`,
  };
}

/** Creates one in-site invitation per active marathon the student has not answered. */
export async function ensureStudentMarathonInvites(
  userId: number,
): Promise<{ cards: HomeMarathonCard[]; invites: MarathonInvite[] }> {
  const state = await loadMarathonHomeState({ userId, role: "student" });
  for (const invite of state.invites) {
    const note = inviteNotification(invite);
    try {
      await notifyUser({ userId, ...note, once: true });
    } catch (error) {
      console.error("marathon invite notification", error);
    }
  }
  return state;
}
