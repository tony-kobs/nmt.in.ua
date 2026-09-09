"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { DiagnosticDestinationPreview } from "./DiagnosticDestinationPreview";
import css from "./DiagnosticPageTurnLink.module.css";

const TRANSITION_MS = 1150;

type DiagnosticPageTurnLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
};

export function DiagnosticPageTurnLink({ href, className, children }: DiagnosticPageTurnLinkProps) {
  const router = useRouter();
  const [isTurning, setIsTurning] = useState(false);
  const navigatingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (navigatingRef.current) {
      event.preventDefault();
      return;
    }
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      return;
    }

    event.preventDefault();
    navigatingRef.current = true;
    setIsTurning(true);
    timeoutRef.current = setTimeout(() => {
      router.push(href);
    }, TRANSITION_MS);
  };

  return (
    <>
      <a href={href} className={className} onClick={handleClick}>
        {children}
      </a>
      {isTurning
        ? createPortal(
            <div className={css.overlay} aria-hidden="true">
              <div className={css.underlay}>
                <DiagnosticDestinationPreview />
              </div>
              <div className={css.castShadow} />
              <div className={css.flap} />
              <div className={css.fold} />
              <div className={css.curlCorner} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
