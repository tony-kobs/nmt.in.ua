"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/getCurrentUser";
import { saveTextbookSection, TEXTBOOK_BODY_MAX } from "./store";

function themeCode(raw: FormDataEntryValue | null): string {
  const code = String(raw ?? "").trim();
  if (!/^[A-Z0-9-]{1,32}$/.test(code)) return "";
  return code;
}

export async function saveTextbookSectionAction(formData: FormData): Promise<void> {
  const user = await requireRole(["admin"]);
  const code = themeCode(formData.get("code"));
  if (!code) redirect("/admin/textbook?error=code");

  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n");
  if (body.length > TEXTBOOK_BODY_MAX) {
    redirect(`/admin/textbook/${code}?error=size`);
  }

  const saved = await saveTextbookSection({
    themeCode: code,
    body,
    publish: formData.get("intent") === "publish",
    userId: user.id,
  });
  if (!saved) redirect("/admin/textbook?error=theme");
  const savedFlag = formData.get("intent") === "publish" ? "published" : "draft";
  redirect(`/admin/textbook/${code}?saved=${savedFlag}`);
}
