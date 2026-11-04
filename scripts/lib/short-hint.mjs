/**
 * A short nudge for the card lightbulb: one or two sentences, no final number.
 * No network calls. Patterns cover prompts we can see in the repo and on the
 * cabinet screenshots. Anything else stays empty until a person writes it.
 */

const MAX = 240;

/**
 * @param {{ taskText?: string | null, comments?: string | null, answers?: Array<string | null>, rightAnswer?: number | null }} row
 * @returns {string | null}
 */
export function proposeShortHint(row) {
  const prompt = stripMath(row.taskText ?? "");
  const comments = (row.comments ?? "").replace(/\s+/g, " ").trim();
  const answer = answerToken(row);

  const patterned = patternHint(prompt);
  if (patterned && !leaks(patterned, answer)) return clip(patterned);

  if (!comments || /^правильна\s+відповідь/iu.test(comments)) return null;

  const sentences = comments
    .split(/(?<=[.!?])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const safe = sentences.filter((sentence) => !leaks(sentence, answer) && !conclusion(sentence));
  const picked = safe.slice(0, 2).join(" ");
  if (picked.length >= 12 && picked.length <= MAX && !leaks(picked, answer)) {
    return clip(picked);
  }
  return null;
}

function stripMath(value) {
  return value
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$]*\$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function answerToken(row) {
  const index = Number(row.rightAnswer);
  if (!Number.isInteger(index) || index < 1) return "";
  const text = row.answers?.[index - 1];
  if (typeof text !== "string") return "";
  const match = text.match(/-?\d+(?:[.,]\d+)?/);
  return match ? match[0].replace(",", ".") : "";
}

function leaks(text, answer) {
  if (!answer) return /\bвідповідь\s*:/iu.test(text);
  const escaped = answer.replace(".", "\\.");
  if (new RegExp(`(?<![\\d.])${escaped}(?![\\d.])`).test(text)) return true;
  return /\bвідповідь\s*:/iu.test(text) || /тому\b[^.]{0,80}=\s*-?\d+/iu.test(text);
}

function conclusion(sentence) {
  return /тому\b/iu.test(sentence) && /=/.test(sentence);
}

function clip(text) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX ? null : flat;
}

function patternHint(prompt) {
  if (/середн\p{L}*\s+лін/iu.test(prompt) && /периметр/iu.test(prompt)) {
    return "Середня лінія трикутника паралельна стороні й дорівнює її половині. Знайдіть цю сторону, потім додайте три сторони.";
  }
  if (/подвійн\p{L}*\s+нерівн/iu.test(prompt)) {
    return "Помножте всі частини на додатний знаменник і зберіть доданки з невідомим. Із цілих чисел, що лишились, візьміть потрібне.";
  }
  if (/нерівн/iu.test(prompt)) {
    return "Розвʼяжіть нерівність так само, як рівняння, і стежте за знаком.";
  }
  if (/периметр/iu.test(prompt)) {
    return "Периметр — це сума всіх сторін. Спочатку знайдіть сторону, якої бракує.";
  }
  if (/площ/iu.test(prompt)) {
    return "Згадайте формулу площі цієї фігури і підставте відомі сторони.";
  }
  if (/обчисліть/iu.test(prompt) || prompt.length < 48) {
    if (/\d+\s*\+\s*\d+/.test(prompt)) return "Додайте числа.";
    if (/\d+\s*[−\-]\s*\d+/.test(prompt)) return "Відніміть менше число від більшого.";
    if (/\d+\s*[×*]\s*\d+/.test(prompt)) return "Перемножте числа.";
    if (/\d+\s*[÷/]\s*\d+/.test(prompt)) return "Поділіть перше число на друге.";
    if (/[²]/.test(prompt) || /\d+\s*\^\s*2/.test(prompt)) {
      return "Спочатку піднесіть до квадрата, потім виконайте решту дій.";
    }
  }
  return null;
}
