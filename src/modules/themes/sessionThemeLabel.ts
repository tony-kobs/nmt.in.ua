/** Cabinet theme removed in `065_remove_elem_ops_theme.sql`. Old attempts may still store this id. */
export const RETIRED_ELEM_OPS_THEME_ID = 1;
export const RETIRED_ELEM_OPS_THEME_CODE = "MATH-05-ELEM-OPS";
export const RETIRED_ELEM_OPS_THEME_LABEL = "Елементарні дії";

export const DIAGNOSTIC_THEME_LABEL = "Загальна діагностика";
export const NMT_THEME_LABEL = "Симулятор НМТ";
export const MISSING_THEME_LABEL = "Тема недоступна";

/**
 * Label for a session whose `themes` row is gone.
 * A non-empty joined name always wins. An empty name is not a crash:
 * diagnostic attempts have no theme, the simulator uses the variant,
 * and theme id 1 keeps the name students already saw.
 */
export function sessionThemeLabel(input: {
  themeName?: string | null;
  themeId?: number | null;
  sessionType?: number | null;
  variantLabel?: string | null;
}): string {
  const name = input.themeName?.trim() ?? "";
  if (name) return name;
  if (input.sessionType === 4) {
    const variant = input.variantLabel?.trim() ?? "";
    return variant || NMT_THEME_LABEL;
  }
  if (input.themeId == null || input.themeId === 0) return DIAGNOSTIC_THEME_LABEL;
  if (input.themeId === RETIRED_ELEM_OPS_THEME_ID) return RETIRED_ELEM_OPS_THEME_LABEL;
  return MISSING_THEME_LABEL;
}
