import type { SqlConnection } from "@/lib/db/mysql";
import type { AuthUser } from "../types";
import { isDemoAccountLogin } from "../demoLogin";
import {
  AVATAR_MAX_BYTES,
  isAvatarFile,
  sniffAvatarMime,
} from "../avatarConstants";
import {
  deleteStoredAvatar,
  upsertStoredAvatar,
} from "./store";

export type UploadAvatarErrorCode =
  | "requiredFile"
  | "invalidType"
  | "tooLarge"
  | "demoAccount"
  | "serverError";

export class UploadAvatarError extends Error {
  constructor(
    message: string,
    public readonly code: UploadAvatarErrorCode,
  ) {
    super(message);
    this.name = "UploadAvatarError";
  }
}

type AvatarDeps = {
  getConnection: () => Promise<SqlConnection>;
};

export async function uploadAvatar(
  input: { user: AuthUser; file: FormDataEntryValue | null },
  deps?: AvatarDeps,
): Promise<number> {
  if (isDemoAccountLogin(input.user.login)) {
    throw new UploadAvatarError(
      "Demo account avatars cannot be changed.",
      "demoAccount",
    );
  }

  if (!isAvatarFile(input.file) || input.file.size <= 0) {
    throw new UploadAvatarError("Avatar file is required.", "requiredFile");
  }

  if (input.file.size > AVATAR_MAX_BYTES) {
    throw new UploadAvatarError("Avatar file is too large.", "tooLarge");
  }

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  if (bytes.byteLength > AVATAR_MAX_BYTES) {
    throw new UploadAvatarError("Avatar file is too large.", "tooLarge");
  }

  const mime = sniffAvatarMime(bytes);
  if (!mime) {
    throw new UploadAvatarError("Avatar file type is not allowed.", "invalidType");
  }

  try {
    return await upsertStoredAvatar(
      { userId: input.user.id, mime, bytes },
      deps,
    );
  } catch (error) {
    console.error("uploadAvatar: unexpected database error", error);
    throw new UploadAvatarError("Database operation failed.", "serverError");
  }
}

export async function removeAvatar(
  user: AuthUser,
  deps?: AvatarDeps,
): Promise<void> {
  if (isDemoAccountLogin(user.login)) {
    throw new UploadAvatarError(
      "Demo account avatars cannot be changed.",
      "demoAccount",
    );
  }

  try {
    await deleteStoredAvatar(user.id, deps);
  } catch (error) {
    console.error("removeAvatar: unexpected database error", error);
    throw new UploadAvatarError("Database operation failed.", "serverError");
  }
}
