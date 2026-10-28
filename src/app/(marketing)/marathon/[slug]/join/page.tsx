import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DiagnosticShell } from "@/components/diagnostic/DiagnosticShell";
import { MarathonJoin } from "@/components/marathon/MarathonJoin";
import { createPageMetadata } from "@/constants/seo";
import { isDatabaseUnavailable, rethrowNavigation } from "@/lib/db/unavailable";
import { getCurrentUser } from "@/modules/auth/getCurrentUser";
import { publicMarathonPhase } from "@/modules/marathons/daily/publicPage";
import { getPublicDailyBySlug } from "@/modules/marathons/daily/store";
import { readUtm } from "@/modules/marathons/daily/utm";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const t = await getTranslations("Metadata.marathonJoin");
  const missing = await getTranslations("Metadata.notFound");
  let open = false;
  try {
    const marathon = await getPublicDailyBySlug(slug);
    const phase = publicMarathonPhase(marathon, new Date());
    open = phase === "parking" || phase === "open";
  } catch (error) {
    rethrowNavigation(error);
    if (!isDatabaseUnavailable(error)) throw error;
    open = true;
  }
  if (!open) {
    return createPageMetadata({
      title: missing("title"),
      description: missing("description"),
      path: `/marathon/${slug}/join`,
      noIndex: true,
    });
  }
  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: `/marathon/${slug}/join`,
    noIndex: true,
  });
}

export default async function MarathonJoinPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const marathon = await getPublicDailyBySlug(slug);
  const phase = publicMarathonPhase(marathon, new Date());
  if (!marathon || (phase !== "parking" && phase !== "open")) notFound();
  const user = await getCurrentUser();
  if (user && phase === "open") redirect(`/marathon/${slug}/map`);
  if (user) redirect(`/marathon/${slug}`);
  return (
    <DiagnosticShell>
      <MarathonJoin
        slug={slug}
        title={marathon.title}
        error={one(query.error)}
        utm={readUtm({
          utm_source: one(query.utm_source),
          utm_medium: one(query.utm_medium),
          utm_campaign: one(query.utm_campaign),
          utm_content: one(query.utm_content),
          utm_term: one(query.utm_term),
        })}
      />
    </DiagnosticShell>
  );
}
