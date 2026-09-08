import type { TaskVisual } from "@/modules/testing/taskPresentation";
import css from "./TaskVisualArea.module.css";

type TaskVisualAreaProps = {
  visual: TaskVisual;
};

/**
 * Renders whatever visual `resolveTaskPresentation` extracted from the task
 * text (a diagram/graph image, or a small data table) — or nothing at all,
 * which is the common case today and must never change layout for a task
 * that has no visual.
 */
export function TaskVisualArea({ visual }: TaskVisualAreaProps) {
  if (!visual) return null;

  if (visual.kind === "image") {
    return (
      <div className={css.visual}>
        {/* Author-provided alt via task_text markdown: empty alt means the
         * task author marked the image decorative. Plain <img>, not
         * next/image: the URL is arbitrary content-author input with unknown
         * dimensions, not a static asset next/image can optimize. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={css.image} src={visual.src} alt={visual.alt} loading="lazy" />
      </div>
    );
  }

  return (
    <div className={css.visual}>
      <div className={css.tableScroll}>
        <table className={css.table}>
          <thead>
            <tr>
              {visual.headers.map((header, index) => (
                <th key={index} scope="col">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visual.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
