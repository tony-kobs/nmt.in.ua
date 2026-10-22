import css from "./BrandMark.module.css";

type BrandMarkProps = {
  className?: string;
};

/** Знак LevelUP з файлу логотипа. Стрілка окремо, щоб по ній ішов перелив. */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <span className={className ? `${css.mark} ${className}` : css.mark} aria-hidden>
      <img src="/brand/levelup-book.png" alt="" className={css.book} draggable={false} />
      <span className={css.arrow}>
        <span className={css.flow} />
      </span>
    </span>
  );
}
