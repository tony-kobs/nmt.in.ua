"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";
import clsx from "clsx";
import {
  registerTeacherAction,
  type RegisterTeacherActionState,
} from "@/modules/payments/actions";
import {
  TEACHER_FEE_UAH,
  isAllowedWayForPayCheckoutUrl,
} from "@/modules/payments/constants";
import type { WayForPayCheckout } from "@/modules/payments/wayforpayClient";
import {
  PASSWORD_MAX_LEN,
  PASSWORD_MIN_LEN,
} from "@/modules/auth/validateRegistration";
import css from "../auth.module.css";

const INITIAL: RegisterTeacherActionState = { status: "idle" };

type TeacherRegisterFormProps = {
  paymentConfigured: boolean;
};

function CheckoutRedirect({
  checkout,
  submitLabel,
}: {
  checkout: WayForPayCheckout;
  submitLabel: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!isAllowedWayForPayCheckoutUrl(checkout.actionUrl)) return;
    formRef.current?.submit();
  }, [checkout]);

  const { fields } = checkout;

  return (
    <form
      ref={formRef}
      className={css.checkoutForm}
      method="post"
      action={checkout.actionUrl}
      acceptCharset="utf-8"
    >
      <input type="hidden" name="merchantAccount" value={fields.merchantAccount} />
      <input type="hidden" name="merchantAuthType" value={fields.merchantAuthType} />
      <input
        type="hidden"
        name="merchantDomainName"
        value={fields.merchantDomainName}
      />
      <input
        type="hidden"
        name="merchantTransactionSecureType"
        value={fields.merchantTransactionSecureType}
      />
      <input type="hidden" name="merchantSignature" value={fields.merchantSignature} />
      <input type="hidden" name="language" value={fields.language} />
      <input type="hidden" name="returnUrl" value={fields.returnUrl} />
      <input type="hidden" name="serviceUrl" value={fields.serviceUrl} />
      <input type="hidden" name="orderReference" value={fields.orderReference} />
      <input type="hidden" name="orderDate" value={fields.orderDate} />
      <input type="hidden" name="amount" value={fields.amount} />
      <input type="hidden" name="currency" value={fields.currency} />
      <input type="hidden" name="orderLifetime" value={fields.orderLifetime} />
      {fields.productName.map((name, index) => (
        <input key={`name-${index}`} type="hidden" name="productName[]" value={name} />
      ))}
      {fields.productCount.map((count, index) => (
        <input
          key={`count-${index}`}
          type="hidden"
          name="productCount[]"
          value={count}
        />
      ))}
      {fields.productPrice.map((price, index) => (
        <input
          key={`price-${index}`}
          type="hidden"
          name="productPrice[]"
          value={price}
        />
      ))}
      <button type="submit" className={css.submit}>
        {submitLabel}
      </button>
    </form>
  );
}

export function TeacherRegisterForm({
  paymentConfigured,
}: TeacherRegisterFormProps) {
  const t = useTranslations("TeacherRegister");
  const [state, formAction, pending] = useActionState(
    registerTeacherAction,
    INITIAL,
  );
  const paying = state.status === "pay";
  const busy = pending || paying;

  return (
    <div className={css.card}>
      <header className={css.intro}>
        <p className={css.kicker}>{t("kicker")}</p>
        <h1 className={css.title}>{t("title")}</h1>
        <p className={css.lead}>{t("lead")}</p>
        <p className={css.feeChip}>{t("fee", { fee: TEACHER_FEE_UAH })}</p>
        <ul className={css.benefits}>
          <li>{t("benefits.mentor")}</li>
          <li>{t("benefits.progress")}</li>
          <li>{t("benefits.cabinet")}</li>
        </ul>
      </header>

      {paymentConfigured ? null : (
        <p className={clsx(css.alert, css.alertNotice)} role="status">
          {t("paymentNotConfigured")}
        </p>
      )}

      {paying ? (
        <CheckoutRedirect checkout={state.checkout} submitLabel={t("redirecting")} />
      ) : null}

      <form className={css.form} action={formAction}>
        <label className={css.field}>
          <span className={css.label}>{t("displayName")}</span>
          <input
            className={css.input}
            name="displayName"
            autoComplete="name"
            required
            minLength={2}
            maxLength={100}
            disabled={busy}
          />
        </label>

        <label className={css.field}>
          <span className={css.label}>{t("login")}</span>
          <input
            className={css.input}
            name="login"
            autoComplete="username"
            required
            minLength={3}
            maxLength={50}
            pattern="[A-Za-z0-9][A-Za-z0-9._-]{1,48}[A-Za-z0-9]|[A-Za-z0-9]{3,50}"
            title={t("loginHint")}
            disabled={busy}
          />
          <span className={css.hint}>{t("loginHint")}</span>
        </label>

        <label className={css.field}>
          <span className={css.label}>{t("password")}</span>
          <input
            className={css.input}
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LEN}
            maxLength={PASSWORD_MAX_LEN}
            disabled={busy}
          />
          <span className={css.hint}>
            {t("passwordHint", { min: PASSWORD_MIN_LEN })}
          </span>
        </label>

        <label className={css.field}>
          <span className={css.label}>{t("passwordConfirm")}</span>
          <input
            className={css.input}
            type="password"
            name="passwordConfirm"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LEN}
            maxLength={PASSWORD_MAX_LEN}
            disabled={busy}
          />
        </label>

        {state.status === "error" ? (
          <p className={clsx(css.alert, css.alertError)} role="alert">
            {t(`errors.${state.code}`)}
          </p>
        ) : null}

        {paying ? null : (
          <button type="submit" className={css.submit} disabled={busy}>
            {pending
              ? t("submitting")
              : paymentConfigured
                ? t("submitPay", { fee: TEACHER_FEE_UAH })
                : t("submitSave")}
          </button>
        )}
      </form>

      <p className={css.switch}>
        {t("haveAccount")}{" "}
        <Link href="/login" className={css.switchLink}>
          {t("signInLink")}
        </Link>
      </p>
      <p className={css.switch}>
        {t("studentPrompt")}{" "}
        <Link href="/register" className={css.switchLink}>
          {t("studentLink")}
        </Link>
      </p>
    </div>
  );
}
