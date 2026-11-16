"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/modules/auth/getCurrentUser";
import { isPlatformStaff, type UserRole } from "@/modules/auth/types";
import { normalizePromoCode, type RedeemCode } from "./values";
import { createPromoCode, redeemPromo, setPromoActive } from "./store";

export type PromoFormState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; code: string };

export type RedeemFormState =
  | { status: "idle" }
  | { status: "ok"; accessUntil: string; teacherName: string | null }
  | { status: "error"; code: RedeemCode | "server" };

function actorRole(role: UserRole, realRole?: UserRole): UserRole {
  return realRole ?? role;
}

function promoHome(role: UserRole): string {
  return isPlatformStaff(role) ? "/admin/promos" : "/promo";
}

export async function createPromoAction(
  _prev: PromoFormState,
  formData: FormData,
): Promise<PromoFormState> {
  const user = await requireUser();
  const role = actorRole(user.role, user.realRole);
  const result = await createPromoCode({
    actorId: user.id,
    actorRole: role,
    code: formData.get("code"),
    accessDays: formData.get("accessDays"),
    maxUses: formData.get("maxUses"),
    expiresAt: formData.get("expiresAt"),
    teacherRef: formData.get("teacherRef"),
  });
  if (!result.ok) return { status: "error", code: result.code };
  revalidatePath("/promo");
  revalidatePath("/admin/promos");
  return { status: "ok" };
}

export async function setPromoActiveAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const role = actorRole(user.role, user.realRole);
  const promoId = Number(formData.get("id"));
  const active = String(formData.get("active") ?? "") === "1";
  const result = await setPromoActive({
    actorId: user.id,
    actorRole: role,
    promoId,
    active,
  });
  const home = promoHome(role);
  revalidatePath("/promo");
  revalidatePath("/admin/promos");
  redirect(result.ok ? `${home}?saved=1` : `${home}?error=${result.code}`);
}

export async function redeemPromoAction(
  _prev: RedeemFormState,
  formData: FormData,
): Promise<RedeemFormState> {
  const user = await requireUser();
  const role = actorRole(user.role, user.realRole);
  if (role !== "student") return { status: "error", code: "not_student" };
  const result = await redeemPromo({
    userId: user.id,
    code: normalizePromoCode(formData.get("code")) ?? formData.get("code"),
  });
  if (!result.ok) return { status: "error", code: result.code };
  revalidatePath("/account");
  revalidatePath("/students");
  return {
    status: "ok",
    accessUntil: result.accessUntil.toISOString(),
    teacherName: result.teacherName,
  };
}
