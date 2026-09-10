import Link from "next/link";
import { getTranslations } from "next-intl/server";
import clsx from "clsx";
import css from "../auth.module.css";
import { ClaimTeacherSession } from "../ClaimTeacherSession/ClaimTeacherSession";
import { TeacherPaymentTestBypass } from "../TeacherPaymentTestBypass";

export type TeacherRegisterOutcome = "success" | "pending" | "fail";

type TeacherRegisterResultProps = {
  outcome: TeacherRegisterOutcome;
  reference?: string | null;
  showTestBypass?: boolean;
};

export async function TeacherRegisterResult({
  outcome,
  reference,
  showTestBypass = false,
}: TeacherRegisterResultProps) {
  const t = await getTranslations("TeacherRegister.result");
  const isFail = outcome === "fail";
  const titleId = "teacher-register-result-title";

  return (
    <section className={css.card} aria-labelledby={titleId}>
      {outcome === "success" && reference ? (
        <ClaimTeacherSession reference={reference} />
      ) : null}

      <header className={css.intro}>
        <p className={css.kicker}>{t(`${outcome}.kicker`)}</p>
        <h1 id={titleId} className={css.title}>
          {t(`${outcome}.title`)}
        </h1>
        <p className={css.lead}>{t(`${outcome}.lead`)}</p>
      </header>

      {isFail ? (
        <p className={clsx(css.alert, css.alertError)} role="status">
          {t("fail.hint")}
        </p>
      ) : null}

      {showTestBypass ? (
        <TeacherPaymentTestBypass reference={reference} />
      ) : null}

      <p className={css.switch}>
        {outcome === "fail" ? (
          <Link href="/register/teacher" className={css.switchLink}>
            {t("fail.retry")}
          </Link>
        ) : (
          <Link href={outcome === "success" ? "/" : "/login"} className={css.switchLink}>
            {outcome === "success" ? t("success.cta") : t("pending.cta")}
          </Link>
        )}
      </p>
    </section>
  );
}
