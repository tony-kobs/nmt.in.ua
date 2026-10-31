import { notFound } from "next/navigation";
import { DatabaseUnavailable } from "@/components/status/DatabaseUnavailable";
import { isDatabaseUnavailable, rethrowNavigation } from "@/lib/db/unavailable";
import { publicMarathonPhase } from "@/modules/marathons/daily/publicPage";
import { loadPublicMarathon } from "./publicMarathon";

/**
 * Missing, archived, and non-daily slugs answer 404 before any child
 * `loading.tsx` can start a 200 stream. The landing page still suspends
 * after this guard, so a real course keeps its loading state.
 */
export default async function MarathonSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let marathon;
  try {
    marathon = await loadPublicMarathon(slug);
  } catch (error) {
    rethrowNavigation(error);
    if (isDatabaseUnavailable(error)) return <DatabaseUnavailable />;
    throw error;
  }
  if (!marathon || publicMarathonPhase(marathon, new Date()) === "hidden") {
    notFound();
  }
  return children;
}
