-- Fix typo in theme name: «геоментрія» → «геометрія»
-- (live example: «Доказова геоментрія» → «Доказова геометрія»).
--
-- The misspelling lives in MySQL `themes.name`, not in git content.
-- Theme code GEO-07-PROOFS is id 9 (`scripts/sql/010_theme_codes.sql`).
--
-- MUST be applied on hosting / production MySQL. Deploy does not run SQL.
--
--   mysql ... < scripts/sql/014_fix_theme_geometry_typo.sql
--
-- Safe to re-run: REPLACE is a no-op when the typo is already gone.

UPDATE themes
SET name = REPLACE(name, 'геоментрія', 'геометрія')
WHERE name LIKE '%геоментрія%';

UPDATE themes
SET name = REPLACE(name, 'Геоментрія', 'Геометрія')
WHERE name LIKE '%Геоментрія%';

UPDATE themes
SET name = REPLACE(name, 'ГЕОМЕНТРІЯ', 'ГЕОМЕТРІЯ')
WHERE name LIKE '%ГЕОМЕНТРІЯ%';
