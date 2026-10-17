export type ShelfMarathon = {
  slug: string;
  title: string;
  description: string;
  status: "active" | "finished";
  daysCount: number;
  startDate: string;
};

export type ShelfCard = {
  slug: string;
  title: string;
  description: string;
  status: "active" | "finished";
  daysCount: number;
  joined: boolean;
  /** Detail page. Empty when the student still has to enroll. */
  href: string;
};

/**
 * Student marathon tab.
 * Every active course is visible. A finished course stays only for someone
 * who joined, so they can open the summary.
 */
export function selectStudentMarathonShelf(input: {
  marathons: ShelfMarathon[];
  joinedSlugs: ReadonlySet<string>;
}): ShelfCard[] {
  const active: ShelfMarathon[] = [];
  const finished: ShelfMarathon[] = [];
  for (const marathon of input.marathons) {
    const slug = marathon.slug.trim();
    if (!slug) continue;
    if (marathon.status === "active") active.push({ ...marathon, slug });
    else if (marathon.status === "finished" && input.joinedSlugs.has(slug)) {
      finished.push({ ...marathon, slug });
    }
  }
  active.sort(byStartDesc);
  finished.sort(byStartDesc);
  return [...active, ...finished].map((marathon) => {
    const joined = input.joinedSlugs.has(marathon.slug);
    return {
      slug: marathon.slug,
      title: marathon.title.trim() || marathon.slug,
      description: marathon.description.trim(),
      status: marathon.status,
      daysCount: marathon.daysCount,
      joined,
      href: joined ? `/marathon/${marathon.slug}/map` : "",
    };
  });
}

function byStartDesc(a: ShelfMarathon, b: ShelfMarathon): number {
  return b.startDate.localeCompare(a.startDate) || a.slug.localeCompare(b.slug);
}
