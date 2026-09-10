import { AVATAR_CROP_PX } from "@/modules/auth/avatarConstants";

/**
 * Center-crops to a square JPEG so a phone photo does not blow the upload cap.
 * Falls back to the original file when the browser cannot decode it.
 */
export async function cropAvatarFile(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_CROP_PX;
    canvas.height = AVATAR_CROP_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const scale = Math.max(
      AVATAR_CROP_PX / bitmap.width,
      AVATAR_CROP_PX / bitmap.height,
    );
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    ctx.drawImage(
      bitmap,
      (AVATAR_CROP_PX - width) / 2,
      (AVATAR_CROP_PX - height) / 2,
      width,
      height,
    );

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.88);
    });
    if (!blob) return file;
    return new File([blob], "avatar.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}
