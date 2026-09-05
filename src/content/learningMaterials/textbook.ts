import { getLearningMaterial } from "./materials";
import type { MaterialContentBlock } from "./sourceBlocks";

type TextbookSource = {
  materialSlug: string;
  start?: string;
  end?: string;
};

const textbookSources: Partial<Record<string, TextbookSource[]>> = {
  "MATH-05-ELEM-OPS": [
    {
      materialSlug: "algebra-10",
      start: "Елементарні дії",
      end: "14. Функції",
    },
  ],
  "MATH-06-ARITH-OPS": [
    {
      materialSlug: "algebra-8-complex",
      start: "2. Арифметичні дії",
      end: "6. Математичні вирази",
    },
  ],
  "GEO-07-ELEM-PLAN": [
    {
      materialSlug: "geometry-7",
      start: "3. Елементарна планіметрія",
      end: "7. Обрахункова геометрія",
    },
  ],
  "ALG-09-EQ-INEQ": [
    {
      materialSlug: "algebra-9",
      start: "4. Рівності та нерівності",
      end: "14. Функції",
    },
  ],
  "ALG-08-FRACTIONS": [
    {
      materialSlug: "algebra-8-fractions",
      start: "5. Дроби",
      end: "8. Рівняння",
    },
  ],
  "ALG-07-EXPRESSIONS": [
    {
      materialSlug: "algebra-7",
      start: "6. Математичні вирази",
      end: "8. Рівняння",
    },
  ],
  "GEO-07-CALC": [
    {
      materialSlug: "geometry-7",
      start: "7. Обрахункова геометрія",
    },
    {
      materialSlug: "circle-and-angles",
      start: "7. Обрахункова геометрія",
    },
  ],
  "ALG-07-EQ": [
    {
      materialSlug: "algebra-7",
      start: "8. Рівняння",
      end: "12. Текстові задачі:",
    },
  ],
  "ALG-08-POWERS-ROOTS": [
    {
      materialSlug: "algebra-8-fractions",
      start: "10. Ступені та корені",
    },
  ],
  "MATH-07-WORD-PROBLEMS": [
    {
      materialSlug: "math-7-algorithms",
      start: "12. Текстові задачі",
      end: "6. Математичні вирази",
    },
  ],
  "ALG-07-COORD-PLANE": [
    {
      materialSlug: "algebra-graphs",
    },
  ],
  "ALG-09-FUNCTIONS": [
    {
      materialSlug: "algebra-9",
      start: "14. Функції",
      end: "21. Комбінаторика. Прогресії",
    },
  ],
  "ALG-09-COMB-PROG": [
    {
      materialSlug: "algebra-9",
      start: "21. Комбінаторика. Прогресії",
      end: "22. Теорія ймовірностей",
    },
  ],
  "MATH-09-PROBABILITY": [
    {
      materialSlug: "algebra-9",
      start: "22. Теорія ймовірностей",
    },
  ],
};

function getParagraphText(block: MaterialContentBlock): string {
  if (block.type !== "paragraph") {
    return "";
  }

  return block.runs
    .map((run) => run.text)
    .join("")
    .trim();
}

function getSourceBlocks(source: TextbookSource): MaterialContentBlock[] {
  const material = getLearningMaterial(source.materialSlug);

  if (!material) {
    return [];
  }

  let startIndex = 0;

  if (source.start) {
    const headingIndex = material.blocks.findIndex(
      (block) => getParagraphText(block) === source.start,
    );

    if (headingIndex === -1) {
      return [];
    }

    startIndex = headingIndex + 1;
  }

  let endIndex = material.blocks.length;

  if (source.end) {
    const headingIndex = material.blocks.findIndex(
      (block, index) =>
        index >= startIndex && getParagraphText(block) === source.end,
    );

    if (headingIndex !== -1) {
      endIndex = headingIndex;
    }
  }

  return material.blocks.slice(startIndex, endIndex);
}

export function getTextbookBlocks(
  themeCode: string,
): MaterialContentBlock[] {
  const sources = textbookSources[themeCode];

  if (!sources) {
    return [];
  }

  return sources.flatMap(getSourceBlocks);
}