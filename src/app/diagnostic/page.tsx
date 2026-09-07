import { getTranslations } from "next-intl/server";
import { DiagnosticIntro } from "@/components/diagnostic/DiagnosticIntro";
import { createPageMetadata } from "@/constants/seo";
import { hasEligibleDiagnosticContent } from "@/modules/diagnostic";

export async function generateMetadata() {
  const t = await getTranslations("Metadata.diagnostic");

  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/diagnostic",
  });
}

/** Bounds how long the page render waits on the availability read below — a
 * slow/unreachable DB must never turn "show the form" into a multi-second
 * blank page; that class of hang is exactly what this feature exists to
 * avoid trading in for. */
const CONTENT_CHECK_BUDGET_MS = 2_000;

/**
 * A DB error (or a check that doesn't resolve within the budget) here is a
 * *read* failure, not proof the catalog is empty — fail open (assume content
 * exists) so a slow or transient DB blip doesn't block the page with the
 * "nothing to test yet" message. If the DB is genuinely down, submitting
 * still fails with its own clear, distinct error (see startDiagnosticAction)
 * — this check only ever *hides* the start button, it never has to be the
 * thing that reports a DB outage.
 */
async function resolveContentAvailable(): Promise<boolean> {
  try {
    return await Promise.race([
      hasEligibleDiagnosticContent(),
      new Promise<true>((resolve) => {
        setTimeout(() => resolve(true), CONTENT_CHECK_BUDGET_MS);
      }),
    ]);
  } catch (error) {
    console.error("DiagnosticPage: content-availability check failed", error);
    return true;
  }
}

/** Public diagnostic entry point — no auth required (see PUBLIC_PATHS in
 * src/proxy.ts). Guests get a signed nmt_guest cookie the first time they
 * submit the form (inside startDiagnosticAction), not on this render. */
export default async function DiagnosticPage() {
  const contentAvailable = await resolveContentAvailable();
  return <DiagnosticIntro contentAvailable={contentAvailable} />;
}
