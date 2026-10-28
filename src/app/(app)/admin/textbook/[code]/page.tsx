import { notFound } from "next/navigation";
import { TextbookEditor } from "@/components/admin/TextbookEditor";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { createPageMetadata } from "@/constants/seo";
import { textbookTopicHref } from "@/content/learningMaterials/textbookHref";
import { requireRole } from "@/modules/auth/getCurrentUser";
import { getThemes } from "@/modules/themes/getThemes";
import { loadTextbookDraft } from "@/modules/textbook/store";

export const dynamic = "force-dynamic";

type EditorPageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ saved?: string | string[]; error?: string | string[] }>;
};

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || null;
}

export async function generateMetadata({ params }: EditorPageProps) {
  const { code } = await params;
  return createPageMetadata({
    title: "Текст підручника",
    description: "Редагування теорії за темами. На сайті видно лише опублікований текст.",
    path: `/admin/textbook/${code}`,
    noIndex: true,
  });
}

export default async function AdminTextbookEditorPage({
  params,
  searchParams,
}: EditorPageProps) {
  await requireRole(["admin"]);
  const { code } = await params;
  const query = await searchParams;
  const themes = await getThemes();
  const theme = themes.find((item) => item.code === code);
  if (!theme) notFound();
  const body = await loadTextbookDraft(theme.code);
  const saved = first(query.saved);
  const savedState = saved === "published" || saved === "draft" ? saved : null;

  return (
    <PageFrame
      kicker="Адмін"
      title={theme.name}
      lead="Збережіть чернетку, щоб перевірити текст. Учень побачить його після «Опублікувати»."
    >
      <TextbookEditor
        code={theme.code}
        name={theme.name}
        initialBody={body}
        saved={savedState}
        error={first(query.error)}
        publicHref={textbookTopicHref(theme.code)}
      />
    </PageFrame>
  );
}
