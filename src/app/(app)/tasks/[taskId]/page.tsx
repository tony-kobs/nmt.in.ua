import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AdminTaskForm } from "@/components/admin/AdminTaskForm";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { createPageMetadata } from "@/constants/seo";
import {
  getAdminThemes,
  getNeighborTaskIds,
  getQuizTaskById,
} from "@/modules/admin-content";
import { requireRole } from "@/modules/auth/getCurrentUser";
import { PLATFORM_STAFF_ROLES } from "@/modules/auth/types";

type EditTaskPageProps = {
  params: Promise<{ taskId: string }>;
};

export async function generateMetadata({ params }: EditTaskPageProps) {
  const t = await getTranslations("AdminContent");
  const { taskId: raw } = await params;
  const taskId = Number(raw);
  const task =
    Number.isInteger(taskId) && taskId > 0
      ? await getQuizTaskById(taskId)
      : null;

  const titleLabel = task
    ? task.taskText.replace(/\$+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) ||
      task.name
    : "";

  return createPageMetadata({
    title: task ? t("editTitleNamed", { name: titleLabel }) : t("editTitle"),
    description: t("editLead"),
    path: `/tasks/${raw}`,
  });
}

export default async function EditAdminTaskPage({ params }: EditTaskPageProps) {
  await requireRole(PLATFORM_STAFF_ROLES);
  const t = await getTranslations("AdminContent");
  const { taskId: raw } = await params;
  const taskId = Number(raw);
  if (!Number.isInteger(taskId) || taskId <= 0) {
    notFound();
  }

  const task = await getQuizTaskById(taskId);
  if (!task) {
    notFound();
  }

  const [themes, neighbors] = await Promise.all([
    getAdminThemes(),
    getNeighborTaskIds(task.themeId, task.id),
  ]);

  return (
    <PageFrame
      kicker={t("kicker")}
      title={t("editTitle")}
      lead={t("editLead")}
    >
      <AdminTaskForm
        key={task.id}
        mode="edit"
        themes={themes}
        themeId={task.themeId}
        task={task}
        nextTaskId={neighbors.nextId}
        backHref={`/?theme=${task.themeId}`}
      />
    </PageFrame>
  );
}
