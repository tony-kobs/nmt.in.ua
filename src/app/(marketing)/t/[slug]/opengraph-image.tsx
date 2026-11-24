import { OG_CONTENT_TYPE, OG_SIZE, renderBrandOg } from "@/lib/seo/ogCard";
import { isDatabaseUnavailable, rethrowNavigation } from "@/lib/db/unavailable";
import { getPublicTeacherCard } from "@/modules/teachers";

export const alt = "Публічна візитка викладача на LevelUP";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function TeacherOpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let title = "Викладач";
  let subtitle = "Підготовка до НМТ з математики";
  try {
    const card = await getPublicTeacherCard(slug);
    if (card) {
      title = card.displayName;
      subtitle = card.headline?.trim() || card.subjects.join(" · ") || subtitle;
    }
  } catch (error) {
    rethrowNavigation(error);
    if (!isDatabaseUnavailable(error)) throw error;
  }
  return renderBrandOg({ kicker: "Викладач", title, subtitle });
}
