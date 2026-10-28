import Link from "next/link";
import { getTranslations } from "next-intl/server";
import css from "./TextbookSectionList.module.css";

export type TextbookListItem = {
  code: string;
  name: string;
  published: boolean;
  draft: boolean;
  fromConspect: boolean;
};

function statusKey(item: TextbookListItem): "badgeDraftPending" | "badgeDraft" | "badgeLive" | "badgeStatic" | "badgeEmpty" {
  if (item.draft && item.published) return "badgeDraftPending";
  if (item.draft) return "badgeDraft";
  if (item.published) return "badgeLive";
  if (item.fromConspect) return "badgeStatic";
  return "badgeEmpty";
}

export async function TextbookSectionList({
  items,
  error,
}: {
  items: TextbookListItem[];
  error: string | null;
}) {
  const t = await getTranslations("TextbookEditor");
  return (
    <>
      {error ? (
        <p className={css.error} role="alert">
          {t("missingTheme")}
        </p>
      ) : null}
      <ul className={css.list}>
        {items.map((item) => {
          const key = statusKey(item);
          const live = key === "badgeDraftPending" || key === "badgeDraft" || key === "badgeLive";
          return (
            <li key={item.code}>
              <Link className={css.row} href={`/admin/textbook/${item.code}`}>
                <span className={css.name}>{item.name}</span>
                <span className={live ? css.badgeOn : css.badge}>{t(key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
