import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { TeacherRegisterResult } from "@/components/auth/TeacherRegisterResult";
import { createPageMetadata } from "@/constants/seo";
import { isTeacherPaymentReference } from "@/modules/payments/constants";
import { readTeacherPayReferenceFromCookie } from "@/modules/payments/actions";
import { findTeacherPaymentByReference } from "@/modules/payments/teacherPayments";

export async function generateMetadata() {
  const t = await getTranslations("Metadata.teacherRegisterSuccess");

  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/register/teacher/success",
    noIndex: true,
  });
}

type SuccessPageProps = {
  searchParams: Promise<{ ref?: string | string[] }>;
};

export default async function TeacherRegisterSuccessPage({
  searchParams,
}: SuccessPageProps) {
  const t = await getTranslations("TeacherRegister");
  const params = await searchParams;
  const rawRef = Array.isArray(params.ref) ? params.ref[0] : params.ref;
  const fromQuery =
    rawRef && isTeacherPaymentReference(rawRef) ? rawRef.trim() : null;
  const fromCookie = fromQuery
    ? null
    : await readTeacherPayReferenceFromCookie();
  const reference = fromQuery ?? fromCookie;

  let outcome: "success" | "pending" | "fail" = "pending";
  if (reference) {
    const payment = await findTeacherPaymentByReference(reference);
    if (payment?.status === "paid") outcome = "success";
    else if (
      payment?.status === "failed" ||
      payment?.status === "expired" ||
      payment?.status === "cancelled"
    ) {
      outcome = "fail";
    }
  }

  return (
    <AuthShell
      aside={{
        badge: t("asideBadge"),
        title: t("asideTitle"),
        lead: t("asideLead"),
      }}
    >
      <TeacherRegisterResult outcome={outcome} reference={reference} />
    </AuthShell>
  );
}
