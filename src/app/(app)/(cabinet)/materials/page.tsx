import { redirect } from "next/navigation";

/** Hub removed — textbook is the only learning-materials surface. */
export default function MaterialsPage() {
  redirect("/materials/textbook");
}
