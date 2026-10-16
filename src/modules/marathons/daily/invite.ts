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
 * Cabinet invitation for a student who already has an account.
 * Participants and declines are excluded. Other roles see nothing.
 */
export function selectMarathonInvites(input: {
  role: string;
  marathons: InviteMarathon[];
  joinedIds: ReadonlySet<number>;
  declinedIds: ReadonlySet<number>;
}): MarathonInvite[] {
  if (input.role !== "student") return [];
  const invites: MarathonInvite[] = [];
  for (const marathon of input.marathons) {
    if (marathon.status !== "active") continue;
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
