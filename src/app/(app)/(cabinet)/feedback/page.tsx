import { getTranslations } from "next-intl/server";
import { FeedbackAdminList } from "@/components/feedback/FeedbackAdminList";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { getNavItem } from "@/constants/navigation";
import { createPageMetadata } from "@/constants/seo";
import { requireRole } from "@/modules/auth/getCurrentUser";
import {
  FEEDBACK_PAGE_SIZE,
  type SiteFeedbackPage,
} from "@/modules/feedback/types";
import { getFeedbackList } from "@/modules/feedback/getFeedbackList";
import { readSearchParam } from "@/lib/queryHref";

const item = getNavItem("/feedback");

export async function generateMetadata() {
  const t = await getTranslations("Metadata.feedback");

  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: item.href,
  });
}

type FeedbackPageProps = {
  searchParams: Promise<{ page?: string | string[] }>;
};

function parsePage(raw: string | undefined): number {
  const page = Number(raw);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

const EMPTY_PAGE: SiteFeedbackPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: FEEDBACK_PAGE_SIZE,
  totalPages: 1,
};

export default async function FeedbackPage({ searchParams }: FeedbackPageProps) {
  await requireRole(["admin"]);

  const t = await getTranslations("FeedbackAdmin");
  const params = await searchParams;
  const page = parsePage(readSearchParam(params.page));

  let feedbackPage: SiteFeedbackPage = EMPTY_PAGE;
  try {
    feedbackPage = await getFeedbackList({ page });
  } catch (error) {
    console.error("feedback: getFeedbackList failed", error);
  }

  return (
    <PageFrame kicker={t("kicker")} title={t("title")} lead={t("lead")}>
      <FeedbackAdminList page={feedbackPage} />
    </PageFrame>
  );
}
