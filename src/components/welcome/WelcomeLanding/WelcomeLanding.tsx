import { getTranslations } from "next-intl/server";
import { JsonLd } from "@/components/seo";
import { SkipLink } from "@/components/ui/SkipLink";
import {
  buildOrganizationJsonLd,
  buildWebApplicationJsonLd,
  buildWebsiteJsonLd,
} from "@/constants/seo";
import { CtaBanner } from "../CtaBanner";
import { DevTeam } from "../DevTeam";
import { Faq } from "../Faq";
import { Features } from "../Features";
import { MarathonHomeCards } from "@/components/marathon/MarathonHomeCards";
import { loadMarathonHomeState } from "@/modules/marathons/daily/store";
import { Hero } from "../Hero";
import { LandingFooter } from "../LandingFooter";
import { LandingHeader } from "../LandingHeader";
import { Teachers } from "../Teachers";
import css from "../landing.module.css";

const structuredData = [
  buildWebsiteJsonLd(),
  buildOrganizationJsonLd(),
  buildWebApplicationJsonLd(),
];

export async function WelcomeLanding() {
  const t = await getTranslations("Common");
  const home = await loadMarathonHomeState({ userId: null, role: null }).catch((error: unknown) => {
    console.error("marathon home", error);
    return { cards: [], invites: [] };
  });

  return (
    <div className={css.page}>
      <SkipLink label={t("skipToContent")} />
      <JsonLd data={structuredData} />
      <div className={css.decor} aria-hidden>
        <span className={css.decorGrid} />
        <span className={css.decorOrbA} />
        <span className={css.decorOrbB} />
        <span className={css.decorOrbC} />
      </div>

      <div className={css.shell}>
        <LandingHeader />
        <main id="main-content" tabIndex={-1}>
          <Hero />
          <MarathonHomeCards cards={home.cards} signedIn={false} bleed />
          <Features />
          <Teachers />
          <Faq />
          <CtaBanner />
          <DevTeam />
        </main>
        <LandingFooter />
      </div>
    </div>
  );
}
