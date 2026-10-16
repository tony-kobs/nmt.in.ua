"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { queryHref } from "@/lib/queryHref";
import css from "./MarathonLeaderboard.module.css";

export function MarathonPicker({
  label,
  value,
  options,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
}) {
  const router = useRouter();
  return (
    <div className={css.picker}>
      <span className={css.pickerLabel} id="leaderboard-marathon-label">
        {label}
      </span>
      <Select
        aria-labelledby="leaderboard-marathon-label"
        value={value}
        options={options}
        onChange={(slug) => {
          router.push(queryHref("/leaderboard", { marathon: slug }));
        }}
      />
    </div>
  );
}
