import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { createPageMetadata } from "@/constants/seo";
import { safeInternalPath } from "@/lib/safeInternalPath";

export async function generateMetadata() {
  const t = await getTranslations("Metadata.register");

  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/register",
    noIndex: true,
  });
}

type RegisterPageProps = {
  searchParams: Promise<{ next?: string | string[]; from?: string | string[] }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const rawFrom = Array.isArray(params.from) ? params.from[0] : params.from;

  return (
    <AuthShell>
      <RegisterForm
        nextPath={safeInternalPath(rawNext)}
        from={rawFrom === "diagnostic" ? "diagnostic" : undefined}
      />
    </AuthShell>
  );
}
