import { OG_CONTENT_TYPE, OG_SIZE, renderBrandOg } from "@/lib/seo/ogCard";

export const alt = "Сторінка Олександри Дубровіної на LevelUP";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function InternOpenGraphImage() {
  return renderBrandOg({
    kicker: "Практика",
    title: "Олександра Дубровіна",
    subtitle: "Калькулятор множення і посилання на код",
  });
}
