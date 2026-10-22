import css from "./BrandWord.module.css";

type BrandWordProps = {
  className?: string;
};

/** Назва марки: Level — зелений логотипа, UP — фіолетовий. */
export function BrandWord({ className }: BrandWordProps) {
  return (
    <span className={className ? `${css.word} ${className}` : css.word} translate="no">
      <span className={css.level}>Level</span>
      <span className={css.up}>UP</span>
    </span>
  );
}
