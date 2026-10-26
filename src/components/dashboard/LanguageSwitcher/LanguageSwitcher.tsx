"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { setLocale } from "@/i18n/actions";
import { LocaleFlag } from "./LocaleFlag";
import css from "./LanguageSwitcher.module.css";

const LOCALES = ["uk", "en", "de"] as const;

type Locale = (typeof LOCALES)[number];

function isLocale(value: string): value is Locale {
  return LOCALES.includes(value as Locale);
}

export function LanguageSwitcher() {
  const t = useTranslations("LanguageSwitcher");
  const rawLocale = useLocale();
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "uk";
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function changeLocale(nextLocale: Locale) {
    if (nextLocale === locale || pending) {
      setOpen(false);
      return;
    }
    setPending(true);
    setOpen(false);
    try {
      await setLocale(nextLocale);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={css.root} ref={rootRef}>
      <button
        type="button"
        className={css.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t("triggerAria", { name: t(`${locale}Full`) })}
        disabled={pending}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={css.flag}>
          <LocaleFlag locale={locale} />
        </span>
        <span className={css.currentName}>{t(`${locale}Full`)}</span>
        <svg
          className={clsx(css.chevron, open && css.chevronOpen)}
          width="12"
          height="8"
          viewBox="0 0 12 8"
          fill="none"
          aria-hidden
        >
          <path
            d="M1 1.5 6 6.5 11 1.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
          <ul id={menuId} className={css.menu} role="menu" aria-label={t("aria")}>
            {LOCALES.map((item) => {
              const active = item === locale;
              return (
                <li key={item} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className={clsx(css.option, active && css.optionActive)}
                    aria-current={active ? "true" : undefined}
                    disabled={pending}
                    onClick={() => void changeLocale(item)}
                  >
                    <span className={css.flag}>
                      <LocaleFlag locale={item} />
                    </span>
                    <span>{t(`${item}Full`)}</span>
                    {active ? (
                      <svg
                        className={css.check}
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden
                      >
                        <path
                          d="M3.2 8.3 6.4 11.4 12.8 4.6"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
    </div>
  );
}
