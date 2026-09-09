import { redirect } from "next/navigation";

type MaterialPageProps = {
  params: Promise<{ slug: string }>;
};

/**
 * Per-class conspects are folded into `/materials/textbook`.
 * Keep the route so old bookmarks do not 404.
 */
export default async function MaterialPage({ params }: MaterialPageProps) {
  await params;
  redirect("/materials/textbook");
}
