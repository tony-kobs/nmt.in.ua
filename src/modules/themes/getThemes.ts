import type { SqlConnection } from "@/lib/db/mysql";
import { cachedCatalogQuery } from "@/lib/cache/catalogCache";

export type Theme = {
  id: number;
  code: string;
  name: string;
  description: string;
  ord: number;
};

const SQL_THEMES = `
  SELECT id, code, name, description, ord
  FROM themes
  ORDER BY ord ASC, id ASC
`;

type GetThemesDeps = {
  getConnection: () => Promise<SqlConnection>;
};

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

async function loadThemes(deps: GetThemesDeps): Promise<Theme[]> {
  const connection = await deps.getConnection();

  try {
    const rows = await connection.query<{
      id: number;
      code: string;
      name: string;
      description: string;
      ord: number;
    }>(SQL_THEMES);

    return rows.map((row) => ({
      id: row.id,
      code: row.code.trim(),
      name: row.name.trim(),
      description: row.description.trim(),
      ord: row.ord,
    }));
  } finally {
    connection.release();
  }
}

export async function getThemes(
  deps?: GetThemesDeps,
): Promise<Theme[]> {
  if (deps) {
    return loadThemes(deps);
  }
  return cachedCatalogQuery("themes", () =>
    loadThemes({ getConnection: loadDefaultConnection }),
  );
}
