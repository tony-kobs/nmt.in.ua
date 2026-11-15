"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/Select";
import type { ParentChild } from "@/modules/parent-students/types";
import { parentChildHref } from "./childNavigation";

export function ParentChildSelect({ roster, selectedId }: { roster: ParentChild[]; selectedId: number }) {
  const t = useTranslations("ParentDashboard");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <label id="parent-child-label" htmlFor="parent-child-select">{t("chooseChild")}</label>
      <Select
        id="parent-child-select"
        value={String(selectedId)}
        options={roster.map((child) => ({ value: String(child.id), label: child.displayName }))}
        aria-labelledby="parent-child-label"
        aria-busy={pending}
        disabled={pending}
        onChange={(value) => {
          const href = parentChildHref(value, roster);
          if (href && value !== String(selectedId)) startTransition(() => router.push(href, { scroll: false }));
        }}
      />
      <p role="status" aria-live="polite">{pending ? t("loading") : null}</p>
    </div>
  );
}
