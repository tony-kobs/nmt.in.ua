import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { canManageMarathons } from "@/modules/marathons/daily/manageAccess";
import { applyMarathonImport, checkMarathonImport } from "@/modules/marathons/daily/marathonCsvStore";
import { parseMarathonWorkbook } from "@/modules/marathons/daily/marathonWorkbook";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2_000_000;

function denied() {
  return NextResponse.json(
    { ok: false, errors: [{ row: 0, message: "Немає доступу." }] },
    { status: 401 },
  );
}

export async function POST(request: Request) {
  if (!(await canManageMarathons())) return denied();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, errors: [{ row: 0, message: "Файл не прочитано." }] });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, errors: [{ row: 0, message: "Спочатку оберіть файл .xlsx." }] });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, errors: [{ row: 0, message: "Файл завеликий. Межа — 2 МБ." }] });
  }
  const parsed = await parseMarathonWorkbook(new Uint8Array(await file.arrayBuffer()));
  if (form.get("mode") === "apply") {
    try {
      const applied = await applyMarathonImport(parsed);
      if (!applied.ok) return NextResponse.json(applied);
      revalidatePath("/admin/marathons");
      revalidatePath(`/admin/marathons/${applied.id}`);
      return NextResponse.json({
        ok: true,
        href: `/admin/marathons/${applied.id}?saved=${Date.now()}`,
      });
    } catch (error) {
      console.error("marathon xlsx apply", error);
      return NextResponse.json({
        ok: false,
        errors: [{ row: 0, message: "Не вдалося записати файл. Нічого не змінено." }],
      });
    }
  }
  try {
    const checked = await checkMarathonImport(parsed);
    if (!checked.ok) return NextResponse.json(checked);
    return NextResponse.json({ ok: true, preview: checked.preview });
  } catch (error) {
    console.error("marathon xlsx preview", error);
    return NextResponse.json({
      ok: false,
      errors: [{ row: 0, message: "Не вдалося перевірити файл." }],
    });
  }
}
