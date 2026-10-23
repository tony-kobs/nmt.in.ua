"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { motion, useReducedMotion } from "motion/react";
import { SkipLink } from "@/components/ui/SkipLink";
import { BrandMark } from "@/components/brand/BrandMark";
import { BrandWord } from "@/components/brand/BrandWord";
import { SITE_NAME } from "@/constants/seo";
import { revealHidden, revealShown, tweenSlow } from "@/lib/motionPresets";
import { NotebookSpinner } from "@/components/status/NotebookSpinner";
import type { statusCopy } from "@/i18n/statusPages";
import css from "./StatusScene.module.css";

type Copy = ReturnType<typeof statusCopy>;

type StatusSceneProps = {
  variant: "notFound" | "error" | "loading";
  copy: Copy;
  layout?: "page" | "embed";
  reset?: () => void;
  digest?: string;
};

export function StatusScene({
  variant,
  copy,
  layout = "page",
  reset,
  digest,
}: StatusSceneProps) {
  const reduce = useReducedMotion();
  const regionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (variant === "loading") return;
    regionRef.current?.focus({ preventScroll: true });
  }, [variant]);
  const pack =
    variant === "notFound"
      ? copy.notFound
      : variant === "error"
        ? copy.error
        : copy.loading;
  const art =
    variant === "notFound"
      ? "/status/not-found.webp"
      : variant === "error"
        ? "/status/error.webp"
        : null;
  const Region = layout === "embed" ? motion.section : motion.main;

  return (
    <div className={clsx(css.page, layout === "embed" && css.embed)}>
      {layout === "page" ? <SkipLink label={copy.skip} /> : null}
      <div className={css.decor} aria-hidden>
        <span className={css.decorGrid} />
        <span className={css.orbA} />
        <span className={css.orbB} />
      </div>
      <div className={css.shell}>
        {layout === "page" ? (
          <Link href="/" className={css.brand} aria-label={SITE_NAME} translate="no">
            <span className={css.glyph} aria-hidden>
              <BrandMark />
            </span>
            <BrandWord />
          </Link>
        ) : null}
        <Region
          ref={regionRef}
          id={layout === "page" ? "main-content" : undefined}
          tabIndex={-1}
          className={css.card}
          aria-labelledby="status-title"
          aria-busy={variant === "loading" || undefined}
          initial={reduce ? false : revealHidden}
          animate={revealShown}
          transition={tweenSlow}
        >
          <p className={css.kicker}>
            {"code" in pack ? (
              <>
                <span className={css.accent}>{pack.code}</span>
                {" · "}
                {pack.kicker}
              </>
            ) : (
              pack.kicker
            )}
          </p>
          <h1 id="status-title" className={css.title}>
            {pack.title}
          </h1>
          <p className={css.lead}>{pack.lead}</p>
          {art && "imageAlt" in pack ? (
            <figure className={css.art}>
              {/* Direct file: the 500 page still shows the drawing if the optimizer rejects the url. */}
              <Image
                src={art}
                alt={pack.imageAlt}
                width={1024}
                height={1024}
                className={css.artImg}
                sizes="(min-width: 768px) 22rem, 80vw"
                priority
                unoptimized
              />
            </figure>
          ) : null}
          {variant === "loading" ? (
            <div className={css.loadingWrap}>
              <NotebookSpinner label={copy.loading.label} />
            </div>
          ) : null}
          {variant !== "loading" ? (
            <div className={css.actions}>
              {variant === "error" && reset ? (
                <button type="button" className={css.primary} onClick={reset}>
                  {copy.retry}
                </button>
              ) : (
                <Link href="/" className={css.primary}>
                  {copy.home}
                </Link>
              )}
              {variant === "error" ? (
                <Link href="/" className={css.ghost}>
                  {copy.home}
                </Link>
              ) : (
                <Link href="/welcome" className={css.ghost}>
                  {copy.welcome}
                </Link>
              )}
            </div>
          ) : null}
          {digest ? <p className={css.digest}>{digest}</p> : null}
        </Region>
      </div>
    </div>
  );
}
