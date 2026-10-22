"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { hasPermission } from "@/modules/auth/permissions";
import { updateSupportTicket } from "./store";
import { parseTicketFilter, parseTicketStatus } from "./text";

function back(status: string, flag: "saved" | "error", code?: string): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (flag === "saved") params.set("saved", "1");
  else params.set("error", code ?? "invalid");
  const query = params.toString();
  return query ? `/admin/support?${query}` : "/admin/support";
}

export async function updateSupportTicketAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const filter = parseTicketFilter(String(formData.get("returnStatus") ?? ""));
  if (!hasPermission(user.role, "marathon:manage")) redirect("/");
  const id = Number(String(formData.get("id") ?? "").trim());
  const status = parseTicketStatus(String(formData.get("status") ?? ""));
  const reply = String(formData.get("reply") ?? "");
  if (!Number.isInteger(id) || id <= 0 || !status) redirect(back(filter, "error", "invalid"));
  const result = await updateSupportTicket({ id, status, reply });
  revalidatePath("/admin/support");
  if (result === "ok") redirect(back(filter, "saved"));
  redirect(back(filter, "error", result));
}
