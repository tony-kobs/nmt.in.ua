import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DatabaseUnavailable } from "@/components/status/DatabaseUnavailable";
import { DiagnosticShell } from "@/components/diagnostic/DiagnosticShell";
import { isDatabaseUnavailable, rethrowNavigation } from "@/lib/db/unavailable";
import { MarathonLanding } from "@/components/marathon/MarathonLanding";
import { MarathonParking } from "@/components/marathon/MarathonParking";
import { createPageMetadata } from "@/constants/seo";
import { getCurrentUser } from "@/modules/auth/getCurrentUser";
import { readRiddleSession } from "@/modules/marathons/daily/riddleSession";
import { marathonOpensAt, publicMarathonPhase } from "@/modules/marathons/daily/publicPage";
import {
  getParticipant,
  loadLandingRiddles,
  loadMarathonBoard,
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
  if (!marathon || phase === "hidden") notFound();
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
    try {
      user = await getCurrentUser();
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
        <MarathonParking
          marathon={marathon}
          opensAt={marathonOpensAt(marathon)}
          loggedIn={Boolean(user)}
          joined={joined}
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
