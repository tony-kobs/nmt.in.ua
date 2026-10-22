"use client";

import { useEffect, useRef, type ReactNode } from "react";
import css from "./MarathonHomeCards.module.css";

/** The list keeps its own scrollbar. The wheel always moves the page. */
export function LeaderboardScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta =
        event.deltaMode === 1
          ? event.deltaY * 16
          : event.deltaMode === 2
            ? event.deltaY * window.innerHeight
            : event.deltaY;
      window.scrollBy(0, delta);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <ol ref={ref} className={css.boardList}>
      {children}
    </ol>
  );
}
