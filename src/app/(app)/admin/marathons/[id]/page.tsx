import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MarathonAdminEditor } from "@/components/marathon/MarathonAdmin";
import { createPageMetadata } from "@/constants/seo";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { hasPermission } from "@/modules/auth/permissions";
import { aggregateFunnel } from "@/modules/marathons/daily/funnel";
import {
  getDailyById,
  listAdminTasks,
  listDays,
  listMaterials,
  listParticipantReports,
  listRiddles,
  searchQuizTasks,
} from "@/modules/marathons/daily/store";
import { parseUtmSource } from "@/modules/marathons/daily/utm";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string | string[];
    saved?: string | string[];
    q?: string | string[];
  }>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata() {
  const t = await getTranslations("Metadata.marathonAdmin");
  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/admin/marathons",
    noIndex: true,
  });
}

export default async function AdminMarathonEditorPage({ params, searchParams }: PageProps) {
  const user = await requireUser();
  if (!hasPermission(user.role, "marathon:manage")) redirect("/");
  const { id } = await params;
  const marathonId = Number(id);
  if (!Number.isInteger(marathonId)) notFound();
  const marathon = await getDailyById(marathonId);
  if (!marathon) notFound();
  const query = await searchParams;
  const q = first(query.q);
  const [riddles, days, reports, questions] = await Promise.all([
    listRiddles(marathon.id),
    listDays(marathon.id),
    listParticipantReports(marathon.id),
    searchQuizTasks(q ?? ""),
  ]);
  const detailed = await Promise.all(
    days.map(async (day) => ({
      ...day,
      materials: await listMaterials(day.id),
      tasks: (await listAdminTasks(day.id)).map((task) => ({
        id: task.id,
        order: task.order,
        prompt: task.prompt,
        options: task.options,
        questionId: task.questionId,
      })),
    })),
  );
  const funnel = aggregateFunnel(
    reports.map((person) => ({
      source: parseUtmSource(person.source),
      emailVerified: person.emailVerified,
      daysCompleted: Array.from({ length: marathon.daysCount }, (_, index) =>
        person.days.some((day) => day.dayNumber === index + 1 && day.completed),
      ),
      finished: person.finished,
      converted: person.converted,
    })),
    marathon.daysCount,
  );
  return (
    <MarathonAdminEditor
      marathon={marathon}
      riddles={riddles}
      days={detailed}
      reports={reports}
      funnel={funnel}
      questions={questions}
      error={first(query.error)}
      savedToken={first(query.saved)}
    />
  );
}
