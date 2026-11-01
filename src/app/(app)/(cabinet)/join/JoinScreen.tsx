import { getTranslations } from "next-intl/server";
import { JoinInviteForm } from "@/components/join/JoinInviteForm";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { requireUser } from "@/modules/auth/getCurrentUser";
import {
  isInviteCode,
  normalizeInviteCode,
} from "@/modules/teacher-students/codes";

export async function JoinScreen({ initialCode }: { initialCode?: string }) {
  const user = await requireUser();
  const t = await getTranslations("JoinInvite");
  const normalized = initialCode ? normalizeInviteCode(initialCode) : "";
  const prefill = isInviteCode(normalized)
    ? normalized
    : (initialCode?.trim() ?? "");

  if (user.role !== "student") {
    return (
      <PageFrame kicker={t("kicker")} title={t("title")} lead={t("lead")}>
        <p>{t("wrongRole")}</p>
      </PageFrame>
    );
  }

  return (
    <PageFrame kicker={t("kicker")} title={t("title")} lead={t("lead")}>
      <JoinInviteForm initialCode={prefill} />
    </PageFrame>
  );
}
