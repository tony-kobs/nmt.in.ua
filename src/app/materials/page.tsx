import Link from "next/link";
import { getNavItem } from "@/constants/navigation";
import { createPageMetadata } from "@/constants/seo";
import { learningMaterials } from "@/content/learningMaterials";
import css from "./page.module.css";

const item = getNavItem("/materials");

export const metadata = createPageMetadata({
  title: item.label,
  description: item.description,
  path: item.href,
});

export default function MaterialsPage() {
  return (
    <div className={css.page}>
      <header className={css.header}>
        <p className={css.kicker}>Бібліотека знань</p>
        <h1 className={css.title}>Навчальні матеріали</h1>
        <p className={css.lead}>
          Обирай конспект, повторюй теорію та переглядай формули у зручному
          математичному форматі.
        </p>
      </header>

      <ul className={css.grid} aria-label="Список навчальних матеріалів">
        <li>
          <Link href="/materials/textbook" className={css.card}>
            <div className={css.cardTop}>
              <span className={css.cardIcon} aria-hidden>
                ∑
              </span>
            </div>

            <h2 className={css.cardTitle}>Підручник</h2>
            <p className={css.summary}>
              Усі доступні теми в одному підручнику зі змістом і швидкими
              переходами до потрібного розділу.
            </p>

            <ul className={css.topics} aria-label="Можливості підручника">
              <li className={css.topic}>Усі теми</li>
              <li className={css.topic}>Зміст</li>
            </ul>

            <span className={css.openLabel}>Відкрити підручник →</span>
          </Link>
        </li>

        {learningMaterials.map((material) => (
          <li key={material.slug}>
            <Link href={`/materials/${material.slug}`} className={css.card}>
              <div className={css.cardTop}>
                <span className={css.cardIcon} aria-hidden>
                  ∑
                </span>
              </div>

              <h2 className={css.cardTitle}>{material.title}</h2>
              <p className={css.summary}>{material.summary}</p>

              <ul className={css.topics} aria-label="Теми матеріалу">
                {material.topics.map((topic) => (
                  <li key={topic.label} className={css.topic}>
                    {topic.label}
                  </li>
                ))}
              </ul>

              <span className={css.openLabel}>Відкрити матеріал →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
