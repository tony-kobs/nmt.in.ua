import Link from "next/link";
import css from "./TextbookSectionList.module.css";

export type TextbookListItem = {
  code: string;
  name: string;
  published: boolean;
  draft: boolean;
};

function statusLabel(item: TextbookListItem): string {
  if (item.draft && item.published) return "Є чернетка";
  if (item.draft) return "Чернетка";
  if (item.published) return "На сайті";
  return "Порожньо";
}

export function TextbookSectionList({ items }: { items: TextbookListItem[] }) {
  return (
    <ul className={css.list}>
      {items.map((item) => (
        <li key={item.code}>
          <Link className={css.row} href={`/admin/textbook/${item.code}`}>
            <span className={css.name}>{item.name}</span>
            <span className={item.published || item.draft ? css.badgeOn : css.badge}>
              {statusLabel(item)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
