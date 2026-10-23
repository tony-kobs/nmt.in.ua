"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  startDiagnosticAction,
  type StartDiagnosticActionState,
} from "@/modules/diagnostic/actions";
import { Icon } from "@/components/ui/Icon/Icon";
import css from "./DiagnosticIntro.module.css";

const INITIAL_STATE: StartDiagnosticActionState = { status: "idle" };

type DiagnosticIntroProps = {
  contentAvailable: boolean;
};

export function DiagnosticIntro({ contentAvailable }: DiagnosticIntroProps) {
  const t = useTranslations("Diagnostic");
  const router = useRouter();

  const [state, formAction, pending] = useActionState(
    startDiagnosticAction,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.status === "success") {
      router.replace(`/diagnostic/session/${state.sessionId}`);
    }
  }, [state, router]);

  const isRedirecting = state.status === "success";
  const controlsDisabled = !contentAvailable || pending || isRedirecting;

  return (
    <section className={css.hero} aria-labelledby="diagnostic-title">
      <div className={css.grid}>
        <div className={css.content}>
          <p className={css.kicker}>{t("kicker")}</p>

          <h1 id="diagnostic-title" className={css.title}>
            {t("titleStart")}{" "}
            <span className={css.titleAccent}>{t("titleAccent")}</span>
          </h1>

          <p className={css.lead}>{t("lead")}</p>

          <form className={css.form} action={formAction}>
            <button
              type="submit"
              className={css.start}
              disabled={controlsDisabled}
            >
              {isRedirecting
                ? t("redirecting")
                : pending
                  ? t("loading")
                  : t("start")}

              <Icon sprite="diagnostic" name="move-right" size={20} />
            </button>
          </form>

          {!contentAvailable ? (
            <p className={css.error} role="status">
              {t("unavailable")}
            </p>
          ) : state.status === "error" ? (
            <p className={css.error} role="alert">
              {t(`errors.${state.code}`)}
            </p>
          ) : null}

          <div className={css.stats} aria-label={t("info.title")}>
            <div className={css.stat}>
              <Icon sprite="diagnostic" name="brain" size={22} />
              <span className={css.statText}>{t("info.items.tasks")}</span>
            </div>

            <div className={css.stat}>
              <Icon sprite="diagnostic" name="clock" size={22} />
              <span className={css.statText}>{t("info.items.duration")}</span>
            </div>

            <div className={css.stat}>
              <Icon sprite="diagnostic" name="target" size={22} />
              <span className={css.statText}>
                {t("info.items.recommendations")}
              </span>
            </div>
          </div>
        </div>

        <div className={css.visual}>
          <div className={css.placeholder}>
            <span className={css.placeholderIcon} aria-hidden="true">
              ∑
            </span>
            <p>Тут з’являться завдання тесту</p>
          </div>
        </div>
      </div>
    </section>
  );
}
