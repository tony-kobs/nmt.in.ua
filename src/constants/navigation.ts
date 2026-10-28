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
    label: "Сьогодні",
    description: "Короткий план: тест, симулятор, марафон, викладач або підручник.",
    status: "ready",
  },
  {
    href: "/topic",
    label: "Тест за темою",
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
    href: "/assign",
    label: "Призначити тест за темою",
    description:
      "Викладач обирає тему, учнів і термін — і бачить, хто вже пройшов.",
    status: "ready",
  },
  {
    href: "/students",
    label: "Мої учні",
    description: "Список учнів викладача: додати за логіном або відв’язати.",
    status: "ready",
  },
  {
    href: "/profiles",
    label: "Профілі",
    description: "Усі облікові записи: фільтр за роллю, бан і видалення.",
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
    href: "/admin/textbook",
    label: "Текст підручника",
    description: "Редагування теорії за темами. На сайті видно лише опублікований текст.",
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
    href: "/feedback",
    label: "Відгуки",
    description: "Оцінки й пропозиції користувачів про сайт.",
    status: "ready",
  },
  {
    href: "/settings",
    label: "Налаштування",
    description: "Імпорт навчального контенту в банк завдань.",
    status: "ready",
  },
  {
    href: "/consultations",
    label: "Консультації викладачів",
    description:
      "Запит на консультацію: учень надсилає заявку, викладачі бачать її в кабінеті.",
    status: "ready",
  },
  {
    href: "/leaderboard",
    label: "Лідерборд марафону",
    description:
      "Рейтинг учасників марафону: середній % правильних відповідей і швидкість.",
    status: "ready",
  },
  {
    href: "/admin/marathons",
    label: "Марафон",
    description: "П'ятиденний марафон: загадки, дні, учасники й вирва.",
    status: "ready",
  },
  {
    href: "/admin/support",
    label: "Звернення",
    description: "Повідомлення учасників з бота і відповідь у Telegram.",
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
