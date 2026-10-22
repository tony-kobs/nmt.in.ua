export type HomeMarathonSource = {
  slug: string;
  title: string;
  description: string;
  status: string;
};

export type HomeMarathonCard = {
  slug: string;
  title: string;
  description: string;
  action: "join" | "continue";
  /** Guest registration, or the map when the student already joined. */
  href: string;
};

export type HomeBoardRow = {
  userId: number;
  place: number;
  name: string;
  points: number;
};

/** The marathon drawn on the home chalkboard, plus its live standings. */
export type HomeMarathonSpotlight = HomeMarathonCard & {
  imageUrl: string | null;
  dayNumber: number;
  daysCount: number;
  board: HomeBoardRow[];
};

/**
 * Active marathons on the home page.
 * Joined students get «Продовжити». A decline hides the card.
 * Guests and everyone else get «Долучитись» (the href is the registration form).
 */
export function selectHomeMarathonCards(input: {
  marathons: HomeMarathonSource[];
  joinedSlugs: ReadonlySet<string>;
  declinedSlugs: ReadonlySet<string>;
}): HomeMarathonCard[] {
  const cards: HomeMarathonCard[] = [];
  for (const marathon of input.marathons) {
    if (marathon.status !== "active") continue;
    const slug = marathon.slug.trim();
    if (!slug) continue;
    const joined = input.joinedSlugs.has(slug);
    if (!joined && input.declinedSlugs.has(slug)) continue;
    cards.push({
      slug,
      title: marathon.title.trim() || slug,
      description: marathon.description.trim(),
      action: joined ? "continue" : "join",
      href: joined ? `/marathon/${slug}/map` : `/marathon/${slug}/join`,
    });
  }
  return cards;
}

/** The course the viewer is in, otherwise the newest active one still on the page. */
export function selectFeaturedHomeMarathon(
  cards: HomeMarathonCard[],
): HomeMarathonCard | null {
  return cards.find((card) => card.action === "continue") ?? cards[0] ?? null;
}
