import { getTranslations } from "next-intl/server";
import { AuthPanel } from "@/components/auth/AuthPanel/AuthPanel";
import { AuthShell } from "@/components/auth/AuthShell";
import type { RegisterRole } from "@/components/auth/RegisterRolePicker/RegisterRolePicker";
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
  searchParams: Promise<{
    next?: string | string[];
    from?: string | string[];
    role?: string | string[];
  }>;
};

function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

function pickRole(raw: string | undefined): RegisterRole {
  return raw === "teacher" ? "teacher" : "student";
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const from = first(params.from) === "diagnostic" ? "diagnostic" : undefined;

  return (
    <AuthShell>
      <AuthPanel
        initialMode="register"
        nextPath={safeInternalPath(first(params.next))}
        initialRole={pickRole(first(params.role))}
        from={from}
      />
    </AuthShell>
  );
}
