"use client";

import { useActionState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  startNmtSimulatorAction,
  type StartNmtSimulatorActionState,
} from "@/modules/testing/actions";
import type { NmtVariantListItem } from "@/modules/testing/getNmtVariants";
import css from "./SimulatorStart.module.css";

const initialState: StartNmtSimulatorActionState = { status: "idle" };

type SimulatorStartProps = {
  variants: NmtVariantListItem[];
};

export function SimulatorStart({ variants }: SimulatorStartProps) {
  const router = useRouter();
  const t = useTranslations("simulator");
  const [state, formAction, isPending] = useActionState(
    startNmtSimulatorAction,
    initialState,
  );

  const byYear = useMemo(() => {
    const groups = new Map<number, NmtVariantListItem[]>();
    for (const variant of variants) {
      const list = groups.get(variant.year) ?? [];
      list.push(variant);
      groups.set(variant.year, list);
    }
    return [...groups.entries()];
  }, [variants]);

  useEffect(() => {
    if (state.status === "success") {
      router.push(`/session/${state.sessionId}?mode=nmt`);
    }
  }, [state, router]);

  return (
    <div className={css.stack}>
      <form action={formAction} className={css.randomBar}>
        <input type="hidden" name="variantId" value="random" />
        <div className={css.randomRow}>
          <p className={css.randomLead}>{t("randomLead")}</p>
          <button
            type="submit"
            className={css.startButton}
            disabled={isPending}
          >
            {isPending ? t("preparing") : t("randomStart")}
          </button>
        </div>
      </form>

      {state.status === "error" ? (
        <p className={css.error}>{t(`errors.${state.code}`)}</p>
      ) : null}

      {variants.length === 0 ? (
        <p className={css.empty}>{t("empty")}</p>
      ) : (
        <div className={css.listWrap}>
          {byYear.map(([year, items]) => (
            <section
              key={year}
              className={css.yearGroup}
              aria-labelledby={`nmt-year-${year}`}
            >
              <h2 id={`nmt-year-${year}`} className={css.yearHeading}>
                {year}
              </h2>
              <ul className={css.list}>
                {items.map((variant) => (
                  <li key={variant.id} className={css.row}>
                    <div className={css.rowMain}>
                      <p className={css.rowTitle}>{variant.label}</p>
                      <p className={css.rowMeta}>
                        {t("tasksCount", { count: variant.tasksNumber })}
                        {" · "}
                        {t("timer")}
                        {" · "}
                        {variant.bestAttempt ? (
                          <span className={css.done}>
                            {t("done", {
                              percent: variant.bestAttempt.percent,
                            })}
                          </span>
                        ) : (
                          <span className={css.todo}>{t("notDone")}</span>
                        )}
                      </p>
                    </div>
                    <form action={formAction} className={css.rowAction}>
                      <input
                        type="hidden"
                        name="variantId"
                        value={variant.id}
                      />
                      <button
                        type="submit"
                        className={css.rowButton}
                        disabled={isPending}
                      >
                        {isPending ? t("preparing") : t("startThis")}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
