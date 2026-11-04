import { RETIRED_ELEM_OPS_THEME_CODE } from "./sessionThemeLabel";

type RetiredImportShape = {
  themes: { id: number; code: string }[];
  themeConnections: { vertexStart: number; vertexFinish: number }[];
  quizTasks: { themeId: number }[];
  problems: { themeId: number }[];
};

/**
 * Drop a re-import of the retired elementary-ops theme.
 * Other themes in the same file stay. Quiz rows and edges are dropped only
 * when they point at a theme record in this file with that code — a different
 * theme that happens to use id 1 is left alone.
 */
export function withoutRetiredElemOps<T extends RetiredImportShape>(datasets: T): T {
  const dropped = new Set(
    datasets.themes
      .filter((theme) => theme.code === RETIRED_ELEM_OPS_THEME_CODE)
      .map((theme) => theme.id),
  );
  if (dropped.size === 0) return datasets;
  return {
    ...datasets,
    themes: datasets.themes.filter((theme) => !dropped.has(theme.id)),
    themeConnections: datasets.themeConnections.filter(
      (edge) => !dropped.has(edge.vertexStart) && !dropped.has(edge.vertexFinish),
    ),
    quizTasks: datasets.quizTasks.filter((task) => !dropped.has(task.themeId)),
    problems: datasets.problems.filter((problem) => !dropped.has(problem.themeId)),
  };
}
