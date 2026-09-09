"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { setLocale } from "@/i18n/actions";
import css from "./LanguageSwitcher.module.css";

const LOCALES = ["uk", "en", "de"] as const;

type Locale = (typeof LOCALES)[number];

export function LanguageSwitcher() {
  const t = useTranslations("LanguageSwitcher");
  const locale = useLocale();
  const router = useRouter();

  async function changeLocale(nextLocale: Locale) {
    await setLocale(nextLocale);
    router.refresh();
  }

  return (
    <div className={css.switcher} role="group" aria-label={t("aria")}>
      {LOCALES.map((item) => {
        const active = locale === item;
        return (
          <button
            key={item}
            type="button"
            className={`${css.languageButton} ${css[item]}`}
            data-active={active}
            data-locale={item}
            aria-label={t(`${item}Full`)}
            aria-pressed={active}
            onClick={() => changeLocale(item)}
            disabled={active}
          >
            {item.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
