import Link from "next/link";
import css from "./DatabaseUnavailable.module.css";

/** Shown when MySQL cannot be reached. No database calls and no motion. */
export function DatabaseUnavailable() {
  return (
    <main className={css.page} id="main-content" tabIndex={-1}>
      <section className={css.card} aria-labelledby="db-unavailable-title">
        <h1 id="db-unavailable-title" className={css.title}>
          Дані тимчасово недоступні
        </h1>
        <p className={css.lead}>
          З’єднання з базою не вдалося. Оновіть сторінку за хвилину — прогрес
          нікуди не зник.
        </p>
        <Link href="/" className={css.link}>
          На головну
        </Link>
      </section>
    </main>
  );
}
