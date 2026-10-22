import "server-only";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { unlinkTelegramAccount, type UnlinkResult } from "./unlink";

export async function unlinkTelegramForCurrentUser(
  deps: {
    requireUser: typeof requireUser;
    unlink: (userId: number) => Promise<UnlinkResult>;
    revalidatePath: typeof revalidatePath;
  } = {
    requireUser,
    unlink: unlinkTelegramAccount,
    revalidatePath,
  },
): Promise<{ status: "success" } | { status: "error" }> {
  const user = await deps.requireUser();
  try {
    await deps.unlink(user.id);
    deps.revalidatePath("/account");
    deps.revalidatePath("/marathon", "layout");
    return { status: "success" };
  } catch (error) {
    console.error("unlinkTelegramForCurrentUser failed", error);
    return { status: "error" };
  }
}
