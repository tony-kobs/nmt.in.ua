export const INVITE_AUDIENCES = ["none", "students", "all"] as const;

export type InviteAudience = (typeof INVITE_AUDIENCES)[number];

export function isInviteAudience(value: string): value is InviteAudience {
  return (INVITE_AUDIENCES as readonly string[]).includes(value);
}

/** Drafts stay quiet until an admin picks an audience. Unknown values are «nobody». */
export function normalizeInviteAudience(value: unknown): InviteAudience {
  return typeof value === "string" && isInviteAudience(value) ? value : "none";
}

export function inviteAudienceIncludes(audience: InviteAudience, role: string): boolean {
  if (audience === "none") return false;
  if (audience === "students") return role === "student";
  return role === "student" || role === "teacher" || role === "admin";
}

export type InviteCandidate = {
  userId: number;
  role: string;
  email: string | null;
  telegramChatId: string | null;
  declined: boolean;
  marathonEmail: boolean;
  marathonTelegram: boolean;
};

/**
 * Who receives the one-shot invitation.
 * A declined user is skipped. So is anyone who turned both marathon channels off.
 * The home card does not use this list.
 */
export function selectInviteRecipients(
  audience: InviteAudience,
  people: InviteCandidate[],
): InviteCandidate[] {
  return people.filter((person) => {
    if (!inviteAudienceIncludes(audience, person.role)) return false;
    if (person.declined) return false;
    if (!person.marathonEmail && !person.marathonTelegram) return false;
    return true;
  });
}

export type InviteMarathon = {
  id: number;
  slug: string;
  title: string;
  status: string;
};

export type MarathonInvite = {
  id: number;
  slug: string;
  title: string;
};

/**
 * Banner for people recorded when the marathon became active.
 * Joining or declining hides it. The role was already applied at send time.
 */
export function selectMarathonInvites(input: {
  marathons: InviteMarathon[];
  joinedIds: ReadonlySet<number>;
  declinedIds: ReadonlySet<number>;
  invitedIds: ReadonlySet<number>;
}): MarathonInvite[] {
  const invites: MarathonInvite[] = [];
  for (const marathon of input.marathons) {
    if (marathon.status !== "active") continue;
    if (!input.invitedIds.has(marathon.id)) continue;
    if (input.joinedIds.has(marathon.id) || input.declinedIds.has(marathon.id)) continue;
    const slug = marathon.slug.trim();
    if (!slug) continue;
    invites.push({
      id: marathon.id,
      slug,
      title: marathon.title.trim() || slug,
    });
  }
  return invites;
}
