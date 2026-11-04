import { renderCopy } from "./copy";
import { loomEmbedSrc, renderSafeMarkdown, youtubeEmbedSrc } from "./richText";

/** Same stand-in the bot uses when the visitor has no name yet. */
const GUEST_NAME = "учаснику";

export type ParkingIntro = {
  /** Public `/api/marathon-media/<token>` path. Null when no intro photo is stored. */
  imageUrl: string | null;
  imageAlt: string;
  /** YouTube or Loom embed. Null when the field is empty or not one of those hosts. */
  videoSrc: string | null;
  /** Plain description, already trimmed. Empty hides the lead. */
  description: string;
  /** Intro rules as the same safe markdown the map uses. Empty hides the block. */
  rulesHtml: string;
};

/**
 * What the public waiting page may show before day 1 opens.
 * Each block is empty when the admin left that field unset.
 * Rules fall back to the saved copy (or the product default) and use the
 * same markdown as the map intro.
 */
export function parkingIntro(input: {
  title: string;
  description: string;
  introVideoUrl: string;
  introImageUrl?: string | null;
  rules?: string | null;
  name?: string | null;
}): ParkingIntro {
  const title = input.title.trim();
  const imageUrl = input.introImageUrl?.trim() || null;
  const video = input.introVideoUrl.trim();
  const description = input.description.trim();
  const rules = input.rules?.trim() ?? "";
  const name = input.name?.trim() || GUEST_NAME;
  return {
    imageUrl,
    imageAlt: title,
    videoSrc: video ? (youtubeEmbedSrc(video) ?? loomEmbedSrc(video)) : null,
    description,
    rulesHtml: rules ? renderSafeMarkdown(renderCopy(rules, { name })) : "",
  };
}
