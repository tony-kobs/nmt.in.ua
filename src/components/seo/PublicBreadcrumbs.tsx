import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildBreadcrumbJsonLd, type BreadcrumbItem } from "@/constants/seo";
import css from "./PublicBreadcrumbs.module.css";

type PublicBreadcrumbsProps = {
  items: readonly BreadcrumbItem[];
  label: string;
};

export async function PublicBreadcrumbs({ items, label }: PublicBreadcrumbsProps) {
  return (
    <nav className={css.nav} aria-label={label}>
      <ol className={css.list}>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.path}-${index}`} className={css.item}>
              {index > 0 ? (
                <span className={css.sep} aria-hidden="true">
                  /
                </span>
              ) : null}
              {last ? (
                <span className={css.current} aria-current="page">
                  {item.name}
                </span>
              ) : (
                <Link className={css.link} href={item.path}>
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      <JsonLd data={buildBreadcrumbJsonLd(items)} />
    </nav>
  );
}
