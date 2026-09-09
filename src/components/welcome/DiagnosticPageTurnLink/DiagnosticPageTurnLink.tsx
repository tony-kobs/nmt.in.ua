"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { DiagnosticDestinationPreview } from "./DiagnosticDestinationPreview";
import { getFoldPosition, getFoldTransform } from "./pageFold";
import landingCss from "../landing.module.css";
import css from "./DiagnosticPageTurnLink.module.css";

const TRANSITION_MS = 1450;
const FALLBACK_NAVIGATE_MS = TRANSITION_MS + 300;

type DiagnosticPageTurnLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
};

export function DiagnosticPageTurnLink({ href, className, children }: DiagnosticPageTurnLinkProps) {
  const router = useRouter();
  // Mounted ahead of the click (hover/focus/touch of the link) so the
  // destination preview's render + layout + first paint — including the
  // decor blur — happen before the animation needs to start, not in the
  // same frame as the click. Rendered hidden (`.overlay` without
  // `.turning`, see the CSS) until `isTurning` flips it visible.
  const [isPreviewMounted, setIsPreviewMounted] = useState(false);
  const [isTurning, setIsTurning] = useState(false);
  const navigatingRef = useRef(false);
  const pushedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const flapRef = useRef<HTMLDivElement>(null);
  const underlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    router.prefetch(href);
  }, [router, href]);

  const warmPreview = useCallback(() => {
    setIsPreviewMounted(true);
  }, []);

  const navigate = useCallback(() => {
    if (pushedRef.current) return;
    pushedRef.current = true;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    router.push(href);
  }, [router, href]);

  useEffect(() => {
    if (!isTurning) return;
    timeoutRef.current = setTimeout(navigate, FALLBACK_NAVIGATE_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isTurning, navigate]);

  useLayoutEffect(() => {
    if (!isTurning) return;

    const source = linkRef.current?.closest<HTMLElement>(`.${landingCss.page}`);
    const sheet = sheetRef.current;
    const flap = flapRef.current;
    const underlay = underlayRef.current;
    if (!source || !sheet || !flap || !underlay) return;

    const bounds = source.getBoundingClientRect();
    const snapshot = source.cloneNode(true) as HTMLElement;
    snapshot.inert = true;
    snapshot.style.position = "absolute";
    snapshot.style.left = `${bounds.left}px`;
    snapshot.style.top = `${bounds.top}px`;
    snapshot.style.width = `${bounds.width}px`;
    snapshot.querySelectorAll("script, [id]").forEach((node) => {
      if (node.tagName === "SCRIPT") node.remove();
      else node.removeAttribute("id");
    });
    const header = source.querySelector<HTMLElement>(`.${landingCss.header}`);
    const snapshotHeader = snapshot.querySelector<HTMLElement>(`.${landingCss.header}`);
    if (header && snapshotHeader) {
      snapshotHeader.style.position = "relative";
      snapshotHeader.style.top = `${header.getBoundingClientRect().top - bounds.top}px`;
    }
    // Read underlay's size before inserting the (large) snapshot: underlay
    // is a fixed/absolute sibling whose box doesn't depend on sheet's
    // content, but reading clientWidth/Height right after replaceChildren
    // would force a synchronous layout of the whole freshly-inserted
    // subtree — a one-time stall right at the start of every turn.
    const width = underlay.clientWidth;
    const height = underlay.clientHeight;
    sheet.replaceChildren(snapshot);

    let frame = 0;
    let startedAt: number | null = null;
    const updateFold = (timestamp: number) => {
      startedAt ??= timestamp;
      const progress = Math.min((timestamp - startedAt) / TRANSITION_MS, 1);
      const { top, bottom } = getFoldPosition(progress);
      const clip = `polygon(${top}% 0%, 100% 0%, 100% 100%, ${bottom}% 100%)`;
      underlay.style.clipPath = clip;
      flap.style.clipPath = clip;
      flap.style.transform = getFoldTransform(width, height, top, bottom);
      if (progress < 1) frame = requestAnimationFrame(updateFold);
      else navigate();
    };
    frame = requestAnimationFrame(updateFold);

    return () => {
      cancelAnimationFrame(frame);
      sheet.replaceChildren();
    };
  }, [isTurning, navigate]);

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
  };

  return (
    <>
      <a
        ref={linkRef}
        href={href}
        className={className}
        onClick={handleClick}
        onMouseEnter={warmPreview}
        onFocus={warmPreview}
        onTouchStart={warmPreview}
      >
        {children}
      </a>
      {isPreviewMounted || isTurning
        ? createPortal(
            <div
              className={isTurning ? `${css.overlay} ${css.turning}` : css.overlay}
              aria-hidden="true"
            >
              <div className={css.underlay} ref={underlayRef}>
                <DiagnosticDestinationPreview />
              </div>
              <div className={css.turnLayer}>
                <div className={css.flap} ref={flapRef}>
                  <div className={css.sheet} ref={sheetRef} />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
