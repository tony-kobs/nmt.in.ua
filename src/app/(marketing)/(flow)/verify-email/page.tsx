import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { VerifyEmailResult } from "@/components/auth/VerifyEmailResult/VerifyEmailResult";
import { createPageMetadata } from "@/constants/seo";
import { readMarathonReturnCookie } from "@/modules/marathons/daily/actions";

export const dynamic = "force-dynamic";

const VERIFY_ERRORS = ["invalid", "expired", "used", "generic"] as const;
type VerifyErrorCode = (typeof VERIFY_ERRORS)[number];

function parseError(raw: string | string[] | undefined): VerifyErrorCode {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return VERIFY_ERRORS.find((code) => code === value) ?? "invalid";
}

export async function generateMetadata() {
  const t = await getTranslations("Metadata.verifyEmail");

  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/verify-email",
    noIndex: true,
  });
}

type VerifyEmailPageProps = {
  searchParams: Promise<{
    token?: string | string[];
    error?: string | string[];
    status?: string | string[];
  }>;
};

export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const params = await searchParams;
  const raw = Array.isArray(params.token) ? params.token[0] : params.token;
  const token = (raw ?? "").trim();

  if (token) {
    redirect(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
  }

  const statusRaw = Array.isArray(params.status) ? params.status[0] : params.status;
  const continueHref =
    statusRaw === "success" ? await readMarathonReturnCookie() : null;

  return (
    <AuthShell>
      {statusRaw === "success" ? (
        <VerifyEmailResult
          status="success"
          continueHref={continueHref ?? undefined}
        />
      ) : (
        <VerifyEmailResult status="error" code={parseError(params.error)} />
      )}
    </AuthShell>
  );
}
