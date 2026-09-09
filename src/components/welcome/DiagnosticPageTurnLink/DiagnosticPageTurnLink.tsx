"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { DiagnosticDestinationPreview } from "./DiagnosticDestinationPreview";
import { getFoldTransform } from "./pageFold";
import landingCss from "../landing.module.css";
import css from "./DiagnosticPageTurnLink.module.css";

const TRANSITION_MS = 1450;
// Fallback only — fires if `animationend` never reaches `.underlay` (tab
// throttled in the background, or some other interruption). Real navigation
// is driven by the animation finishing, see the `isTurning` effect below.
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

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

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

    const underlay = underlayRef.current;
    const handleAnimationEnd = (event: AnimationEvent) => {
      if (event.target !== underlay) return;
      navigate();
    };

    underlay?.addEventListener("animationend", handleAnimationEnd, { once: true });
    timeoutRef.current = setTimeout(navigate, FALLBACK_NAVIGATE_MS);

    return () => {
      underlay?.removeEventListener("animationend", handleAnimationEnd);
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
    sheet.replaceChildren(snapshot);

    let frame = 0;
    const updateFold = () => {
      const clip = getComputedStyle(underlay).clipPath;
      const points = clip.match(/-?[\d.]+%/g)?.map(parseFloat);
      if (points?.length === 8) {
        flap.style.clipPath = clip;
        flap.style.transform = getFoldTransform(
          underlay.clientWidth,
          underlay.clientHeight,
          points[0],
          points[6],
        );
      }
      if (!pushedRef.current) frame = requestAnimationFrame(updateFold);
    };
    updateFold();

    return () => {
      cancelAnimationFrame(frame);
      sheet.replaceChildren();
    };
  }, [isTurning]);

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
