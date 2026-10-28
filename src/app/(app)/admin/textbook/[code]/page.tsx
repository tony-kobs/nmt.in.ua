import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TextbookEditor } from "@/components/admin/TextbookEditor";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { createPageMetadata } from "@/constants/seo";
import { getTextbookBlocks } from "@/content/learningMaterials/textbook";
import { textbookTopicHref } from "@/content/learningMaterials/textbookHref";
import { requireRole } from "@/modules/auth/getCurrentUser";
import { getThemes } from "@/modules/themes/getThemes";
import { parseTextbookMarkup, blocksToTextbookMarkup } from "@/modules/textbook/markup";
import { loadTextbookEditorSource } from "@/modules/textbook/store";

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
  const t = await getTranslations("TextbookEditor");
  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: `/admin/textbook/${code}`,
    noIndex: true,
  });
}

export default async function AdminTextbookEditorPage({
  params,
  searchParams,
}: EditorPageProps) {
  await requireRole(["admin"]);
  const t = await getTranslations("TextbookEditor");
  const { code } = await params;
  const query = await searchParams;
  const themes = await getThemes();
  const theme = themes.find((item) => item.code === code);
  if (!theme) notFound();
  const source = await loadTextbookEditorSource(theme.code);
  const staticBlocks = getTextbookBlocks(theme.code);
  const saved = first(query.saved);
  const savedState = saved === "published" || saved === "draft" ? saved : null;

  return (
    <PageFrame kicker={t("kicker")} title={theme.name} lead={t("editorLead")}>
      <TextbookEditor
        code={theme.code}
        name={theme.name}
        initialBody={source.body}
        staticBody={blocksToTextbookMarkup(staticBlocks)}
        publishedBody={source.publishedBody}
        studentBlocks={
          source.publishedBody ? parseTextbookMarkup(source.publishedBody) : staticBlocks
        }
        saved={savedState}
        error={first(query.error)}
        publicHref={textbookTopicHref(theme.code)}
      />
    </PageFrame>
  );
}
