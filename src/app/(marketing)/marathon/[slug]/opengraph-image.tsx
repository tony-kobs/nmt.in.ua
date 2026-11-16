import { OG_CONTENT_TYPE, OG_SIZE, renderBrandOg } from "@/lib/seo/ogCard";
import { isDatabaseUnavailable, rethrowNavigation } from "@/lib/db/unavailable";
import { publicMarathonPhase } from "@/modules/marathons/daily/publicPage";
import { loadPublicMarathon } from "./publicMarathon";

export const alt = "Математичний марафон LevelUP";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function MarathonOpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let title = "Математичний марафон";
  let subtitle = "Один день — одна тема";
  try {
    const marathon = await loadPublicMarathon(slug);
    const phase = publicMarathonPhase(marathon, new Date());
    if (marathon && phase !== "hidden") {
      title = marathon.title.trim() || title;
      subtitle = marathon.description.trim() || subtitle;
    }
  } catch (error) {
    rethrowNavigation(error);
    if (!isDatabaseUnavailable(error)) throw error;
  }
  return renderBrandOg({ kicker: "Марафон", title, subtitle });
}
