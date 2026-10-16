/** Example marathon used by the admin “create example” action. */
export const MATH_MARATHON_SLUG = "math-5";

export const UKRAINIAN_ALPHABET = [
  "А", "Б", "В", "Г", "Ґ", "Д", "Е", "Є", "Ж", "З", "И", "І", "Ї", "Й", "К",
  "Л", "М", "Н", "О", "П", "Р", "С", "Т", "У", "Ф", "Х", "Ц", "Ч", "Ш", "Щ",
  "Ь", "Ю", "Я",
] as const;

export function spellUkrainianIndexes(indexes: number[]): string {
  return indexes
    .map((index) => UKRAINIAN_ALPHABET[index - 1] ?? "?")
    .join("");
}

export type SeedRiddle = {
  order: number;
  title: string;
  body: string;
  answer: string;
  hint: string;
};

export type SeedTask = {
  order: number;
  prompt: string;
  options: string[];
  correct: number;
};

export type SeedDay = {
  dayNumber: number;
  topic: string;
  introText: string;
  material: string;
  tasks: SeedTask[];
};

export const MATH_MARATHON_SEED = {
  slug: MATH_MARATHON_SLUG,
  title: "Математичний марафон: 5 днів",
  description: "П'ять коротких днів математики: одна тема на день.",
  subject: "math",
  startDate: "2026-10-08",
  unlockHour: "09:00",
  daysCount: 5,
  passThreshold: 60,
  finalCtaText: "Продовжити навчання",
  finalCtaUrl: "/",
  riddles: [
    {
      order: 1,
      title: "Скриня з двома замками",
      body: "Аліса хоче передати Бобу скриню з таємницею. Спільного ключа в них немає: у кожного свій замок, і зняти його може лише власник. Як доставити скриню так, щоб дорогою її ніхто не відкрив?",
      answer:
        "Аліса замикає скриню своїм замком і надсилає Бобу. Боб додає свій замок і повертає скриню. Аліса знімає свій замок і надсилає знову. Боб знімає свій.",
      hint: "Скриня їде туди й назад. Кожен знімає лише власний замок — як у PGP.",
    },
    {
      order: 2,
      title: "Зерна на шахівниці",
      body: "На першу клітину кладуть 1 зерно, на кожну наступну — удвічі більше. Скільки зерен на останній, 64-й клітині, і скільки зерен на всій шахівниці?",
      answer: "На останній клітині 2^63. Усього 2^64 − 1.",
      hint: "Це геометрична прогресія: перший член 1, знаменник 2, 64 клітини.",
    },
    {
      order: 3,
      title: "Числовий шифр",
      body: "Кожна літера — її номер в українській абетці з 33 літер (А=1). Розшифруйте: 4·7, √121, 2^4+6, 2^4, 5^2−6.",
      answer: "28, 11, 22, 16, 19 → ЧИСЛО",
      hint: "Порахуйте кожен вираз окремо, потім знайдіть літеру за номером.",
    },
  ] satisfies SeedRiddle[],
  days: [
    {
      dayNumber: 1,
      topic: "Відсотки й степені",
      introText: "Відсоток — це сота частина числа, а степінь — повторне множення.",
      material:
        "**Відсоток.** 20% від 150 = 0,2 × 150 = 30.\n\n**Степінь.** 2^4 = 2·2·2·2 = 16, а 3^4 = 81.",
      tasks: [
        {
          order: 1,
          prompt: "Скільки буде 15% від 200?",
          options: ["20", "30", "40", "50"],
          correct: 2,
        },
        {
          order: 2,
          prompt: "Обчисліть 3^4.",
          options: ["12", "64", "81", "27"],
          correct: 3,
        },
      ],
    },
    {
      dayNumber: 2,
      topic: "Рівняння",
      introText: "Щоб розв’язати рівняння, виконуйте однакові дії з обома частинами.",
      material:
        "У рівнянні **2x + 3 = 11** відніміть 3 і поділіть на 2: x = 4.\n\nДодатний корінь **x^2 = 49** — це 7.",
      tasks: [
        {
          order: 1,
          prompt: "Розв’яжіть 2x + 3 = 11.",
          options: ["3", "4", "5", "7"],
          correct: 2,
        },
        {
          order: 2,
          prompt: "Який додатний x задовольняє x^2 = 49?",
          options: ["5", "6", "7", "8"],
          correct: 3,
        },
      ],
    },
    {
      dayNumber: 3,
      topic: "Функції та графіки",
      introText: "Функція ставить у відповідність кожному x єдине значення y.",
      material:
        "Для **y = 2x + 1** при x = 3 маємо y = 7. Точка (0, 1) лежить на цій прямій, бо 2·0 + 1 = 1.",
      tasks: [
        {
          order: 1,
          prompt: "Знайдіть y = 2x + 1 при x = 3.",
          options: ["5", "6", "7", "8"],
          correct: 3,
        },
        {
          order: 2,
          prompt: "Чи лежить точка (0, 1) на прямій y = 2x + 1?",
          options: ["Так", "Ні", "Лише при x = 1", "Неможливо сказати"],
          correct: 1,
        },
      ],
    },
    {
      dayNumber: 4,
      topic: "Прогресії",
      introText: "В арифметичній прогресії різниця стала, у геометричній — відношення.",
      material:
        "2, 5, 8, … — різниця 3, наступний член 11.\n\n3, 6, 12, … — знаменник 2, наступний член 24.",
      tasks: [
        {
          order: 1,
          prompt: "Наступний член арифметичної прогресії 2, 5, 8, …",
          options: ["10", "11", "12", "13"],
          correct: 2,
        },
        {
          order: 2,
          prompt: "Наступний член геометричної прогресії 3, 6, 12, …",
          options: ["18", "24", "36", "15"],
          correct: 2,
        },
      ],
    },
    {
      dayNumber: 5,
      topic: "Геометрія та площі",
      introText: "Площа — це міра поверхні фігури в квадратних одиницях.",
      material:
        "Площа квадрата зі стороною a: **a^2**. Площа прямокутника: **a · b**.\n\nКвадрат зі стороною 6 має площу 36. Прямокутник 4×5 має площу 20.",
      tasks: [
        {
          order: 1,
          prompt: "Площа квадрата зі стороною 6.",
          options: ["12", "24", "36", "18"],
          correct: 3,
        },
        {
          order: 2,
          prompt: "Площа прямокутника 4×5.",
          options: ["9", "18", "20", "40"],
          correct: 3,
        },
      ],
    },
  ] satisfies SeedDay[],
};
