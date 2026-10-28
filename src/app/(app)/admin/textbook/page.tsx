import { TextbookSectionList } from "@/components/admin/TextbookEditor";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { createPageMetadata } from "@/constants/seo";
import { requireRole } from "@/modules/auth/getCurrentUser";
import { getThemes } from "@/modules/themes/getThemes";
import { listTextbookSectionStates } from "@/modules/textbook/store";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return createPageMetadata({
    title: "Текст підручника",
    description: "Редагування теорії за темами. На сайті видно лише опублікований текст.",
    path: "/admin/textbook",
    noIndex: true,
  });
}

export default async function AdminTextbookPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  await requireRole(["admin"]);
  const query = await searchParams;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;
  const [themes, states] = await Promise.all([
    getThemes(),
    listTextbookSectionStates(),
  ]);

  return (
    <PageFrame
      kicker="Адмін"
      title="Текст підручника"
      lead="Оберіть тему, виправте текст і опублікуйте. Чернетка учням не показується."
    >
      {error === "code" || error === "theme" ? (
        <p role="alert">Такої теми немає. Оберіть її зі списку.</p>
      ) : null}
      <TextbookSectionList
        items={themes.map((theme) => {
          const state = states.get(theme.code);
          return {
            code: theme.code,
            name: theme.name,
            published: state?.published ?? false,
            draft: state?.draft ?? false,
          };
        })}
      />
    </PageFrame>
  );
}
