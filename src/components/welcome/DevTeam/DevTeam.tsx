import { Unbounded } from "next/font/google";
import { getTranslations } from "next-intl/server";
import { DEV_TEAM_MEMBERS, DEV_TEAM_SERVICE_IDS } from "./teamMembers";
import { DevTeamPanel } from "./DevTeamPanel";

const teamName = Unbounded({
  subsets: ["cyrillic", "latin"],
  weight: "700",
  display: "swap",
  variable: "--font-team",
});

export async function DevTeam() {
  const t = await getTranslations("WelcomeLanding.devTeam");

  const members = DEV_TEAM_MEMBERS.map((member) => ({
    id: member.id,
    name: t(`members.${member.id}.name`),
    role: t(`members.${member.id}.role`),
    photoSrc: member.photoSrc,
    socials: [...member.socials],
  }));

  const services = DEV_TEAM_SERVICE_IDS.map((id) => ({
    id,
    title: t(`services.${id}.title`),
    text: t(`services.${id}.text`),
  }));

  return (
    <DevTeamPanel
      nameFontClass={teamName.variable}
      members={members}
      services={services}
      labels={{
        toggle: t("toggle"),
        collapse: t("collapse"),
        title: t("title"),
        lead: t("lead"),
        socialGithub: t("socialGithub"),
        socialTelegram: t("socialTelegram"),
        carouselAria: t("carouselAria"),
        agencyName: t("agencyName"),
        agencyTaglineJoin: t("agencyTaglineJoin"),
        agencyTaglineRest: t("agencyTaglineRest"),
        agencyLogoAlt: t("agencyLogoAlt"),
        servicesTitle: t("servicesTitle"),
        servicesLead: t("servicesLead"),
      }}
    />
  );
}
