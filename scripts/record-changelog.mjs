import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MONTHS = [
  "січня",
  "лютого",
  "березня",
  "квітня",
  "травня",
  "червня",
  "липня",
  "серпня",
  "вересня",
  "жовтня",
  "листопада",
  "грудня",
];

const ENTRY_RE =
  /### (\d{4}-\d{2}-\d{2}) — (.+?) \(#(\d+)\)\n\n([\s\S]*?)<!-- released: (yes|no) -->/g;

export function parseReleaseNotes(body, title) {
  const text = typeof body === "string" ? body : "";
  const team = plainSection(text, "Для команди") || String(title || "").trim();
  const people = plainSection(text, "Для учня і викладача");
  const screen = rawSection(text, "Скрінкаст");
  const needed = /^\s*-\s*\[[xX]\]\s*потрібен/m.test(screen);
  const approved = /^\s*-\s*\[[xX]\]\s*схвалено показувати/m.test(screen);
  const linkMatch = screen.match(/^\s*-\s*Посилання:\s*(.*)$/m);
  let link = (linkMatch?.[1] || "").trim();
  if (!link || link === "—" || link.startsWith("<!--")) link = "";
  return {
    team: oneLine(team),
    people: oneLine(people),
    needed,
    approved,
    link,
  };
}

export function applyChangelog({ changelog, onboarding, notes, meta, target }) {
  const date = String(meta.mergedAt || "").slice(0, 10);
  let entries = parseEntries(changelog);
  let comment = "";

  if (target === "dev") {
    const entry = {
      date,
      title: oneLine(meta.title),
      number: String(meta.number),
      url: meta.url,
      author: meta.author,
      released: "no",
      ...notes,
    };
    entries = [entry, ...entries.filter((item) => item.number !== entry.number)];
    if (notes.needed && (!notes.link || !notes.approved)) {
      comment = notes.link
        ? "<!-- changelog-screencast -->\nЗапис скрінкаста вже є. Постав у описі PR галочку «схвалено показувати» — тоді посилання з’явиться в гіді."
        : "<!-- changelog-screencast -->\nУ описі PR стоїть «скрінкаст потрібен». Додай рядок «Посилання» і галочку «схвалено показувати». До схвалення відео в гід не потрапляє.";
    }
  } else {
    entries = entries.map((item) => ({ ...item, released: "yes" }));
  }

  const news =
    target === "main" ? renderNews(changelog, entries, meta, date) : newsBlock(changelog);

  return {
    changelog: renderChangelog(changelog, entries, news),
    onboarding: replaceBlock(onboarding, "wiki", renderWiki(entries.slice(0, 8))),
    comment,
  };
}

function plainSection(body, heading) {
  return rawSection(body, heading)
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("<!--")) return false;
      if (/^-\s*\[[ xX]\]/.test(trimmed)) return false;
      if (/^-\s*Посилання:/.test(trimmed)) return false;
      return true;
    })
    .join(" ");
}

function rawSection(body, heading) {
  const match = new RegExp(`^##\\s+${heading}\\s*$`, "im").exec(body);
  if (!match) return "";
  const rest = body.slice(match.index + match[0].length);
  const next = rest.search(/^##\s+/m);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

function oneLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseEntries(changelog) {
  const block = blockText(changelog, "entries");
  const entries = [];
  for (const match of block.matchAll(ENTRY_RE)) {
    const body = match[4];
    entries.push({
      date: match[1],
      title: match[2],
      number: match[3],
      url: field(body, "Посилання на PR"),
      author: field(body, "Автор"),
      team: field(body, "Для команди"),
      people: field(body, "Для людей"),
      needed: field(body, "Скрінкаст") === "потрібен",
      link: field(body, "Запис"),
      approved: field(body, "Схвалено") === "так",
      released: match[5],
    });
  }
  return entries;
}

function field(body, label) {
  const match = body.match(new RegExp(`^- ${label}: (.*)$`, "m"));
  const value = (match?.[1] || "").trim();
  return value === "—" ? "" : value;
}

function renderChangelog(source, entries, news) {
  const body = entries.length
    ? entries.map(renderEntry).join("\n")
    : "Поки що записів немає.\n";
  return replaceBlock(replaceBlock(source, "entries", body), "news", news);
}

function renderEntry(entry) {
  return [
    `### ${entry.date} — ${entry.title} (#${entry.number})`,
    "",
    `- Для команди: ${entry.team || "—"}`,
    `- Для людей: ${entry.people || "—"}`,
    `- Скрінкаст: ${entry.needed ? "потрібен" : "не потрібен"}`,
    `- Запис: ${entry.link || "—"}`,
    `- Схвалено: ${entry.approved ? "так" : "ні"}`,
    `- Автор: ${entry.author || "—"}`,
    `- Посилання на PR: ${entry.url || "—"}`,
    `<!-- released: ${entry.released} -->`,
    "",
  ].join("\n");
}

function renderWiki(entries) {
  if (!entries.length) return "Поки що записів немає.";
  return entries
    .map((entry) => {
      const title = entry.url ? `[${entry.title}](${entry.url})` : entry.title;
      let video = "";
      if (entry.needed && entry.approved && entry.link) {
        video = ` Скрінкаст: ${entry.link}`;
      } else if (entry.needed && entry.link) {
        video = " Скрінкаст ще не схвалено.";
      } else if (entry.needed) {
        video = " Скрінкаст ще записують.";
      }
      return `- **${ukDate(entry.date)}** — ${title}. ${entry.team || "Без опису для команди."}${video}`;
    })
    .join("\n");
}

function renderNews(previous, entries, meta, date) {
  const published = entries.filter((item) => item.people && wasUnreleased(previous, item.number));
  const prior = newsBlock(previous).replace(/^Поки що новин немає\.\s*$/, "").trim();
  if (!published.length) return prior || "Поки що новин немає.";
  const lines = published.map(
    (item) => `- [${item.title}](${item.url}) — ${item.people}`,
  );
  const block = [`### ${date} — [реліз #${meta.number}](${meta.url})`, "", ...lines, ""].join(
    "\n",
  );
  return `${block}${prior ? `\n${prior}\n` : ""}`;
}

function wasUnreleased(changelog, number) {
  const entries = parseEntries(changelog);
  const found = entries.find((item) => item.number === String(number));
  return found ? found.released === "no" : false;
}

function newsBlock(source) {
  return blockText(source, "news").trim();
}

function ukDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

function blockText(source, name) {
  const start = `<!-- changelog:${name} -->`;
  const end = `<!-- /changelog:${name} -->`;
  const from = source.indexOf(start);
  const to = source.indexOf(end);
  if (from < 0 || to < from) {
    throw new Error(`У файлі немає блоку changelog:${name}`);
  }
  return source.slice(from + start.length, to).trim();
}

function replaceBlock(source, name, content) {
  const start = `<!-- changelog:${name} -->`;
  const end = `<!-- /changelog:${name} -->`;
  const from = source.indexOf(start);
  const to = source.indexOf(end);
  if (from < 0 || to < from) {
    throw new Error(`У файлі немає блоку changelog:${name}`);
  }
  return `${source.slice(0, from + start.length)}\n${content.trim()}\n${source.slice(to)}`;
}

function main() {
  const target = process.env.TARGET;
  if (target !== "dev" && target !== "main") {
    throw new Error("TARGET має бути dev або main");
  }
  const changelogPath = "docs/changelog.md";
  const onboardingPath = "docs/nmt-in-ua-onboarding-dev.md";
  const changelog = readFileSync(changelogPath, "utf8");
  const onboarding = readFileSync(onboardingPath, "utf8");
  const notes = parseReleaseNotes(process.env.PR_BODY, process.env.PR_TITLE);
  const next = applyChangelog({
    changelog,
    onboarding,
    notes,
    target,
    meta: {
      number: process.env.PR_NUMBER,
      title: process.env.PR_TITLE,
      url: process.env.PR_URL,
      author: process.env.PR_AUTHOR,
      mergedAt: process.env.MERGED_AT,
    },
  });
  writeFileSync(changelogPath, next.changelog);
  writeFileSync(onboardingPath, next.onboarding);
  if (next.comment && process.env.COMMENT_PATH) {
    writeFileSync(process.env.COMMENT_PATH, next.comment);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
