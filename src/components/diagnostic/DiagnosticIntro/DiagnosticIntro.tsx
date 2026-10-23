"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import {
  startDiagnosticAction,
  type StartDiagnosticActionState,
} from "@/modules/diagnostic/actions";
import { Icon } from "@/components/ui/Icon/Icon";
import { DiagnosticInlineBoard } from "./DiagnosticInlineBoard";
import css from "./DiagnosticIntro.module.css";

const INITIAL_STATE: StartDiagnosticActionState = { status: "idle" };

type DiagnosticIntroProps = {
  contentAvailable?: boolean;
  /** Resolves in the background so the intro can paint before the catalog check. */
  availability?: Promise<boolean>;
};

export function DiagnosticIntro({
  contentAvailable = true,
  availability,
}: DiagnosticIntroProps) {
  const t = useTranslations("Diagnostic");
  const [available, setAvailable] = useState(contentAvailable);

  useEffect(() => {
    if (!availability) return;
    let cancelled = false;
    availability.then(
      (ok) => {
        if (!cancelled) setAvailable(ok);
      },
      () => {
        if (!cancelled) setAvailable(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [availability]);

  const [state, formAction, pending] = useActionState(
    startDiagnosticAction,
    INITIAL_STATE,
  );

  const started = state.status === "success" ? state : null;
  const controlsDisabled = !available || pending;

  return (
    <section className={css.hero} aria-labelledby="diagnostic-title">
      <div className={started ? `${css.grid} ${css.gridLive}` : css.grid}>
        <div className={css.content}>
          <p className={css.kicker}>{t("kicker")}</p>

          <h1 id="diagnostic-title" className={css.title}>
            {t("titleStart")}{" "}
            <span className={css.titleAccent}>{t("titleAccent")}</span>
          </h1>

          <p className={css.lead}>{t("lead")}</p>

          {started ? null : (
            <form className={css.form} action={formAction}>
              <button
                type="submit"
                className={css.start}
                disabled={controlsDisabled}
              >
                {pending ? t("loading") : t("start")}

                <Icon sprite="diagnostic" name="move-right" size={20} />
              </button>
            </form>
          )}

          {!available ? (
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

        <div className={started ? `${css.visual} ${css.visualLive}` : css.visual}>
          {started ? (
            <DiagnosticInlineBoard
              sessionId={started.sessionId}
              isGuest={started.isGuest}
            />
          ) : (
            <div className={css.placeholder}>
              <span className={css.placeholderIcon} aria-hidden="true">
                ∑
              </span>
              <p>Тут з’являться завдання тесту</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
