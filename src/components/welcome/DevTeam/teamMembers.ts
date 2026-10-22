export type DevSocialId = "telegram" | "github";

export type DevSocialLink = {
  id: DevSocialId;
  href: string;
};

export type DevTeamMemberMeta = {
  id: string;
  /** Optional portrait under `public/landing/team/{id}.webp`. */
  photoSrc?: string;
  /** Public profile URLs only — no Discord, city, phone, or email on the card. */
  socials: DevSocialLink[];
};

function telegramHref(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const handle = value.replace(/^@/, "");
  return `https://t.me/${handle}`;
}

function githubHref(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://github.com/${value.replace(/^@/, "")}`;
}

function socials(input: {
  telegram?: string;
  github?: string;
}): DevSocialLink[] {
  const links: DevSocialLink[] = [];
  if (input.telegram) {
    links.push({ id: "telegram", href: telegramHref(input.telegram) });
  }
  if (input.github) {
    links.push({ id: "github", href: githubHref(input.github) });
  }
  return links;
}

/**
 * Roster from the team form (latest row per person).
 * Cards show name + role + social icons only.
 */
export const DEV_TEAM_MEMBERS: readonly DevTeamMemberMeta[] = [
  {
    id: "mykhailo",
    photoSrc: "/landing/team/mykhailo.webp",
    socials: socials({}),
  },
  {
    id: "natalia",
    photoSrc: "/landing/team/natalia.webp",
    socials: socials({
      telegram: "@Narrina",
      github: "nataliastepanova",
    }),
  },
  {
    id: "anton",
    photoSrc: "/landing/team/anton.webp",
    socials: socials({
      telegram: "@tony_kobs",
      github: "tony-kobs",
    }),
  },
  {
    id: "yuliana",
    photoSrc: "/landing/team/yuliana.webp",
    socials: socials({
      telegram: "@Akanekii",
      github: "Yulia2123",
    }),
  },
  {
    id: "valeriy",
    photoSrc: "/landing/team/valeriy.webp",
    socials: socials({
      telegram: "https://t.me/Valerii2268",
      github: "ValeriySolod",
    }),
  },
  {
    id: "adam",
    photoSrc: "/landing/team/adam.webp",
    socials: socials({
      telegram: "@adampershyi",
      github: "AdamPershyi",
    }),
  },
  {
    id: "valentyn",
    photoSrc: "/landing/team/valentyn.webp",
    socials: socials({
      telegram: "https://t.me/Groteskzp",
      github: "groteskzp",
    }),
  },
  {
    id: "romanna",
    photoSrc: "/landing/team/romanna.webp",
    socials: socials({
      telegram: "@romanna_br",
      github: "Romanna-Brych",
    }),
  },
] as const;

export const DEV_TEAM_SERVICE_IDS = [
  "product",
  "support",
  "design",
  "mvp",
  "integrations",
] as const;
