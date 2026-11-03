import { TEXTBOOK_IMAGE_MAX_BYTES } from "@/modules/textbook/imageLimits";

export type UploadError = "type" | "size" | "failed";

type ImageFileLike = {
  size: number;
  type: string;
  name: string;
};

/** Client-side reject before the upload request. SVG is not a textbook image. */
export function clientImageError(file: ImageFileLike): UploadError | null {
  if (file.size > TEXTBOOK_IMAGE_MAX_BYTES) return "size";
  if (file.size === 0 || file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) return "type";
  if (file.type && !file.type.startsWith("image/")) return "type";
  return null;
}
