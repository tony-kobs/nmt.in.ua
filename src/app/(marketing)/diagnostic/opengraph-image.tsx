import { OG_CONTENT_TYPE, OG_SIZE, renderBrandOg } from "@/lib/seo/ogCard";

export const alt = "Вступний тест з математики на LevelUP";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function DiagnosticOpenGraphImage() {
  return renderBrandOg({
    kicker: "Без реєстрації",
    title: "Вступний тест",
    subtitle: "Короткий тест з різних тем НМТ",
  });
}
