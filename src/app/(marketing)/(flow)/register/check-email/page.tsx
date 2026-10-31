import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { CheckEmailForm } from "@/components/auth/CheckEmailForm/CheckEmailForm";
import { createPageMetadata } from "@/constants/seo";
import { safeInternalPath } from "@/lib/safeInternalPath";

export async function generateMetadata() {
  const t = await getTranslations("Metadata.checkEmail");

  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/register/check-email",
    noIndex: true,
  });
}

type CheckEmailPageProps = {
  searchParams: Promise<{
    email?: string | string[];
    mail?: string | string[];
    next?: string | string[];
  }>;
};

export default async function CheckEmailPage({
  searchParams,
}: CheckEmailPageProps) {
  const params = await searchParams;
  const raw = Array.isArray(params.email) ? params.email[0] : params.email;
  const email = (raw ?? "").trim().toLowerCase();
  const mail = Array.isArray(params.mail) ? params.mail[0] : params.mail;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const nextPath = safeInternalPath(rawNext);

  return (
    <AuthShell>
      <CheckEmailForm email={email} mailFailed={mail === "failed"} nextPath={nextPath} />
    </AuthShell>
  );
}
