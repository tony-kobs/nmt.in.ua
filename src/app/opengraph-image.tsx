import { DEFAULT_OG_IMAGE_ALT } from "@/constants/seo";
import { OG_CONTENT_TYPE, OG_SIZE, renderBrandOg } from "@/lib/seo/ogCard";

export const alt = DEFAULT_OG_IMAGE_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpenGraphImage() {
  return renderBrandOg({
    title: "Підготовка до НМТ з математики",
    subtitle: "Тести за темами, симулятор і підручник",
  });
}
