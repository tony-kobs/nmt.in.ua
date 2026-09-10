export type NavItemStatus = "ready" | "soon";

export type NavItem = {
  href: string;
  label: string;
  description: string;
  status: NavItemStatus;
};

/** Primary dashboard navigation — order matches product wireframe. */
export const DASHBOARD_NAV: NavItem[] = [
  {
    href: "/",
    label: "Тест за обраною темою",
    description: "Оберіть тему та кількість завдань — і одразу тренуйтеся.",
    status: "ready",
  },
  {
    href: "/results",
    label: "Результати за темами",
    description:
      "Прогрес по темах: загальний %, останні спроби та швидкість відповідей.",
    status: "ready",
  },
  {
    href: "/sessions",
    label: "Навчальні сесії",
    description: "Історія навчальних сесій і план наступних тренувань.",
    status: "ready",
  },
  {
    href: "/simulator",
    label: "Симулятор НМТ",
    description: "Повний варіант НМТ у форматі УЦОЯО з таймером і балами.",
    status: "ready",
  },
  {
    href: "/materials/textbook",
    label: "Підручник",
    description:
      "Теорія й формули за темами сертифікаційної роботи — один підручник зі змістом.",
    status: "ready",
  },
  {
    href: "/problems",
    label: "Задачник",
    description:
      "Друкований тест по темі: таблиця завдань, щоб роздрукувати й дати дітям.",
    status: "ready",
  },
  {
    href: "/settings",
    label: "Налаштування",
    description: "Імпорт навчального контенту та параметри облікового запису.",
    status: "ready",
  },
  {
    href: "/consultations",
    label: "Консультації викладачів",
    description:
      "Запит на консультацію: учень надсилає заявку, викладачі бачать її в кабінеті.",
    status: "ready",
  },
];

export function getNavItem(href: string): NavItem {
  const item = DASHBOARD_NAV.find((nav) => nav.href === href);
  if (!item) {
    throw new Error(`Navigation item not found: ${href}`);
  }
  return item;
}

export function isNavRouteReady(href: string): boolean {
  return getNavItem(href).status === "ready";
}
