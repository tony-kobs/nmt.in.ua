import { getTranslations } from "next-intl/server";
import { DatabaseUnavailable } from "@/components/status/DatabaseUnavailable";
import { DiagnosticShell } from "@/components/diagnostic/DiagnosticShell";
import { JsonLd } from "@/components/seo";
import { PublicBreadcrumbs } from "@/components/seo/PublicBreadcrumbs";
import { isDatabaseUnavailable, rethrowNavigation } from "@/lib/db/unavailable";
import { MarathonLanding } from "@/components/marathon/MarathonLanding";
import { MarathonParking } from "@/components/marathon/MarathonParking";
import { buildCourseJsonLd, createPageMetadata, getSiteUrl } from "@/constants/seo";
import { getCurrentUser } from "@/modules/auth/getCurrentUser";
import { readRiddleSession } from "@/modules/marathons/daily/riddleSession";
import { loadIntroImagePath } from "@/modules/marathons/daily/imageStore";
import { resolveCopy } from "@/modules/marathons/daily/copy";
import { marathonOpensAt, publicMarathonPhase } from "@/modules/marathons/daily/publicPage";
import {
  getParticipant,
  loadLandingRiddles,
  loadMarathonBoard,
  loadMarathonCopy,
} from "@/modules/marathons/daily/store";
import { readUtm } from "@/modules/marathons/daily/utm";
import { loadPublicMarathon } from "../publicMarathon";

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
  const t = await getTranslations("Metadata.marathon");
  const missing = await getTranslations("Metadata.notFound");
  const hidden = createPageMetadata({
    title: missing("title"),
    description: missing("description"),
    path: `/marathon/${slug}`,
    noIndex: true,
  });
  try {
    const marathon = await loadPublicMarathon(slug);
    const phase = publicMarathonPhase(marathon, new Date());
    if (!marathon || phase === "hidden") return hidden;
    return createPageMetadata({
      title: marathon.title.trim() || slug,
      description: marathon.description || t("description"),
      path: `/marathon/${slug}`,
    });
  } catch (error) {
    rethrowNavigation(error);
    if (!isDatabaseUnavailable(error)) throw error;
    return createPageMetadata({
      title: t("title"),
      description: t("description"),
      path: `/marathon/${slug}`,
      noIndex: true,
    });
  }
}

export default async function MarathonLandingPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const now = new Date();
  let marathon;
  try {
    marathon = await loadPublicMarathon(slug);
  } catch (error) {
    rethrowNavigation(error);
    if (isDatabaseUnavailable(error)) return <DatabaseUnavailable />;
    throw error;
  }
  const phase = publicMarathonPhase(marathon, now);
  // The slug layout already answers 404 before this segment's loading state.
  // A second miss from this page would stream status 200.
  if (!marathon || phase === "hidden") return null;
  const utm = readUtm({
    utm_source: one(query.utm_source),
    utm_medium: one(query.utm_medium),
    utm_campaign: one(query.utm_campaign),
    utm_content: one(query.utm_content),
    utm_term: one(query.utm_term),
  });
  if (phase === "parking") {
    let user;
    let joined = false;
    let introImageUrl: string | null = null;
    let rules = "";
    try {
      const [current, imageUrl, copy] = await Promise.all([
        getCurrentUser(),
        loadIntroImagePath(marathon.id),
        loadMarathonCopy(marathon.id),
      ]);
      user = current;
      introImageUrl = imageUrl;
      rules = resolveCopy("intro_rules", copy);
      if (user) {
        joined = Boolean(await getParticipant(marathon.id, user.id)) || one(query.joined) === "1";
      }
    } catch (error) {
      rethrowNavigation(error);
      if (isDatabaseUnavailable(error)) return <DatabaseUnavailable />;
      throw error;
    }
    return (
      <DiagnosticShell>
        <MarathonPublicHead marathon={marathon} />
        <MarathonParking
          marathon={marathon}
          opensAt={marathonOpensAt(marathon)}
          loggedIn={Boolean(user)}
          joined={joined}
          introImageUrl={introImageUrl}
          rules={rules}
          viewerName={user?.displayName ?? ""}
          error={one(query.error)}
          utm={utm}
        />
      </DiagnosticShell>
    );
  }
  let riddles;
  let user;
  let board;
  try {
    [riddles, user, board] = await Promise.all([
      loadLandingRiddles({
        marathonId: marathon.id,
        subject: marathon.subject,
        count: marathon.landingRiddleCount,
        session: await readRiddleSession(),
      }),
      getCurrentUser(),
      marathon.status === "finished" ? loadMarathonBoard(marathon.id) : Promise.resolve([]),
    ]);
  } catch (error) {
    rethrowNavigation(error);
    if (isDatabaseUnavailable(error)) return <DatabaseUnavailable />;
    throw error;
  }
  return (
    <DiagnosticShell>
      <MarathonPublicHead marathon={marathon} />
      <MarathonLanding
        marathon={marathon}
        riddles={riddles}
        loggedIn={Boolean(user)}
        board={board}
        viewerId={user?.id ?? null}
        error={one(query.error)}
        utm={utm}
      />
    </DiagnosticShell>
  );
}

async function MarathonPublicHead({
  marathon,
}: {
  marathon: { slug: string; title: string; description: string };
}) {
  const seo = await getTranslations("Seo");
  const path = `/marathon/${marathon.slug}`;
  const name = marathon.title.trim() || seo("marathon");
  return (
    <>
      <PublicBreadcrumbs
        label={seo("breadcrumb")}
        items={[
          { name: seo("home"), path: "/" },
          { name, path },
        ]}
      />
      <JsonLd
        data={buildCourseJsonLd({
          id: `${getSiteUrl()}${path}#course`,
          name,
          description: marathon.description || name,
          path,
          teaches: "Математика НМТ",
        })}
      />
    </>
  );
}
