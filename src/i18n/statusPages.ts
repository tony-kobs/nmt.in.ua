export const STATUS_LOCALES = ["uk", "en", "de"] as const;
export type StatusLocale = (typeof STATUS_LOCALES)[number];

const COPY = {
  uk: {
    skip: "Перейти до змісту",
    home: "На головну",
    retry: "Спробувати знову",
    notFound: {
      kicker: "Сторінку не знайдено",
      code: "404",
      title: "Ця сторінка зникла, як знак у рівнянні",
      lead: "Посилання могло застаріти — або ти шукаєш тему, якої ще немає в зошиті. Повернись на головну і продовж підготовку.",
      imageAlt: "Зошит у клітинку з написом 404, де нуль схожий на порожню множину",
    },
    error: {
      kicker: "Щось пішло не так",
      code: "500",
      title: "Формула зламалась на півдорозі",
      lead: "Ми вже дивимось у зошит. Спробуй ще раз — або повернись на головну і зайди з іншого боку.",
      imageAlt: "Аркуш із закресленим рівнянням і чистим рядком нижче",
    },
    loading: {
      kicker: "Трохи зачекай",
      title: "Дописуємо клітинку",
      lead: "Розкладаємо формули на папері.",
      label: "Завантаження",
    },
  },
  en: {
    skip: "Skip to content",
    home: "Go home",
    retry: "Try again",
    notFound: {
      kicker: "Page not found",
      code: "404",
      title: "This page vanished like a sign in an equation",
      lead: "The link may be outdated — or the topic is not in the notebook yet. Head home and keep practising.",
      imageAlt: "Graph-paper notebook with 404, the zero drawn as an empty set",
    },
    error: {
      kicker: "Something went wrong",
      code: "500",
      title: "The formula broke halfway",
      lead: "We are already looking at the notebook. Try again, or go home and come back from another page.",
      imageAlt: "A worksheet with a crossed-out equation and a fresh blank line",
    },
    loading: {
      kicker: "Just a moment",
      title: "Filling in the grid",
      lead: "Laying the formulas out on paper.",
      label: "Loading",
    },
  },
  de: {
    skip: "Zum Inhalt springen",
    home: "Zur Startseite",
    retry: "Erneut versuchen",
    notFound: {
      kicker: "Seite nicht gefunden",
      code: "404",
      title: "Diese Seite ist verschwunden wie ein Zeichen in der Gleichung",
      lead: "Der Link ist vielleicht veraltet — oder das Thema steht noch nicht im Heft. Geh zur Startseite und übe weiter.",
      imageAlt: "Kariertes Heft mit 404, die Null als leere Menge",
    },
    error: {
      kicker: "Etwas ist schiefgelaufen",
      code: "500",
      title: "Die Formel ist auf halbem Weg zerbrochen",
      lead: "Wir schauen schon ins Heft. Versuch es noch einmal oder geh zur Startseite.",
      imageAlt: "Arbeitsblatt mit durchgestrichener Gleichung und einer neuen leeren Zeile",
    },
    loading: {
      kicker: "Einen Moment",
      title: "Wir füllen das Kästchen",
      lead: "Die Formeln kommen aufs Papier.",
      label: "Laden",
    },
  },
} as const;

export function isStatusLocale(value: string | undefined): value is StatusLocale {
  return value === "uk" || value === "en" || value === "de";
}

export function statusCopy(locale: string) {
  return COPY[isStatusLocale(locale) ? locale : "uk"];
}

export function readStatusLocaleFromCookie(cookie = ""): StatusLocale {
  const match = cookie.match(/(?:^|;\s*)NEXT_LOCALE=(uk|en|de)/);
  return isStatusLocale(match?.[1]) ? match[1] : "uk";
}
