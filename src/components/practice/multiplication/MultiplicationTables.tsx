import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TABLES } from "./constants";
import styles from "./MultiplicationTables.module.css";

export async function MultiplicationTables() {
  const t = await getTranslations("PracticeMultiplication");

  return (
    <section className={styles.card}>
      <div className={styles.head}>
        <div className={styles.title}>
          <span className={styles.dots} aria-hidden>
            <i />
            <i />
          </span>
          {t("chooseTable")}
        </div>
        <span className={styles.tag}>{t("range")}</span>
      </div>

      <ul className={styles.grid}>
        {TABLES.map((n) => (
          <li key={n}>
            <Link href={`/practice/multiplication/${n}`} className={styles.link}>
              <span className={styles.num}>× {n}</span>
              <span className={styles.label}>{t("tableLink", { n })}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}