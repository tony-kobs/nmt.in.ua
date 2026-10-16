"use client";

import {
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import css from "./Teachers.module.css";

export type TeacherOfferItem = {
  id: string;
  title: string;
  text: string;
};

export type LandingTeacherCard = {
  id: string;
  /** Absolute/public avatar URL when the teacher uploaded a photo. */
  photoSrc: string | null;
  initials: string;
  name: string;
  subject: string;
  education: string;
  experience: string;
  bioLead: string;
  bioRest: string;
  rating: number;
  reviewCount: number;
};

export type TeachersPanelLabels = {
  kicker: string;
  title: string;
  lead: string;
  verified: string;
  education: string;
  experience: string;
  reviews: string;
  empty: string;
  carouselAria: string;
  prev: string;
  next: string;
  counter: string;
  offerTitle: string;
  offerLead: string;
  joinCta: string;
};

export type TeachersPanelProps = {
  teachers: LandingTeacherCard[];
  features: TeacherOfferItem[];
  labels: TeachersPanelLabels;
};

function VerifiedShield() {
  return (
    <svg
      className={css.shield}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M12 2.2 4.8 5v6.4c0 4.6 3.1 8.8 7.2 10.4 4.1-1.6 7.2-5.8 7.2-10.4V5L12 2.2Z"
      />
      <path
        fill="#f6f1e2"
        d="m10.2 14.7-2.4-2.4 1.1-1.1 1.3 1.3 3.6-3.6 1.1 1.1-4.7 4.7Z"
      />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        fill="currentColor"
        d="m12 3.4 2.5 5.1 5.6.8-4 3.9.9 5.6L12 16.9 6.9 19l.9-5.6-4-3.9 5.6-.8L12 3.4Z"
      />
    </svg>
  );
}

function hasCardText(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== "—" && trimmed !== "-";
}

function TeacherCard({
  teacher,
  labels,
  titleId,
}: {
  teacher: LandingTeacherCard;
  labels: TeachersPanelLabels;
  titleId?: string;
}) {
  const reviews = labels.reviews.replace(
    "{count}",
    String(teacher.reviewCount),
  );

  return (
    <article className={css.card} aria-labelledby={titleId}>
      <div className={css.side}>
        <div className={css.photoWrap}>
          {teacher.photoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- per-user API blob, not a static asset
            <img
              className={css.photo}
              src={teacher.photoSrc}
              alt=""
              draggable={false}
            />
          ) : (
            <span className={css.photoFallback} aria-hidden>
              {teacher.initials}
            </span>
          )}
        </div>
        <p className={css.verified}>{labels.verified}</p>
        <div className={css.sideMeta}>
          <div className={css.nameRow}>
            <h3 id={titleId} className={css.name}>
              {teacher.name}
            </h3>
            <VerifiedShield />
          </div>
          {teacher.rating > 0 ? (
            <p className={css.rating}>
              <span className={css.star} aria-hidden>
                <StarIcon />
              </span>
              <span className={css.ratingValue}>
                {teacher.rating.toFixed(1)}
              </span>
              <span className={css.reviews}>{reviews}</span>
            </p>
          ) : teacher.reviewCount > 0 ? (
            <p className={css.rating}>
              <span className={css.reviews}>{reviews}</span>
            </p>
          ) : null}
        </div>
      </div>

      <div className={css.main}>
        <p className={css.subject}>{teacher.subject}</p>
        {hasCardText(teacher.education) ? (
          <p className={css.fact}>
            <span className={css.factLabel}>{labels.education}:</span>{" "}
            {teacher.education}
          </p>
        ) : null}
        {hasCardText(teacher.experience) ? (
          <div className={css.factRow}>
            <p className={css.fact}>
              <span className={css.factLabel}>{labels.experience}:</span>{" "}
              {teacher.experience}
            </p>
          </div>
        ) : null}
        <div className={css.bio}>
          <p className={css.bioLead}>{teacher.bioLead}</p>
          <p className={css.bioRest}>{teacher.bioRest}</p>
        </div>
      </div>
    </article>
  );
}

function TeachersCarousel({
  teachers,
  labels,
  panelId,
}: {
  teachers: LandingTeacherCard[];
  labels: TeachersPanelLabels;
  panelId: string;
}) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [dragPx, setDragPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const dragPxRef = useRef(0);
  const movedRef = useRef(false);
  const total = teachers.length;

  if (total === 0) return null;

  function go(dir: -1 | 1) {
    setIndex((current) => (current + dir + total) % total);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || total < 2) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("a, button")) return;

    pointerIdRef.current = event.pointerId;
    startXRef.current = event.clientX;
    dragPxRef.current = 0;
    movedRef.current = false;
    setDragging(true);
    setDragPx(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    const delta = event.clientX - startXRef.current;
    if (Math.abs(delta) > 4) movedRef.current = true;
    dragPxRef.current = delta;
    setDragPx(delta);
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== event.pointerId) return;

    const width = viewportRef.current?.offsetWidth ?? 1;
    const threshold = Math.min(72, width * 0.18);
    const delta = dragPxRef.current;
    if (delta <= -threshold) go(1);
    else if (delta >= threshold) go(-1);

    pointerIdRef.current = null;
    dragPxRef.current = 0;
    setDragging(false);
    setDragPx(0);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (!movedRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    movedRef.current = false;
  }

  const trackStyle = {
    transform: `translate3d(calc(${-index * 100}% + ${dragPx}px), 0, 0)`,
    transition:
      dragging || reduceMotion ? "none" : "transform 0.45s var(--ease)",
  } as const;

  return (
    <div
      className={css.carousel}
      aria-label={labels.carouselAria}
      role="region"
    >
      <div
        ref={viewportRef}
        className={
          dragging ? `${css.viewport} ${css.viewportDragging}` : css.viewport
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
      >
        <ul className={css.track} style={trackStyle}>
          {teachers.map((teacher, slideIndex) => {
            const isActive = slideIndex === index;
            return (
              <li
                key={teacher.id}
                className={css.slide}
                aria-hidden={isActive ? undefined : true}
              >
                <TeacherCard
                  teacher={teacher}
                  labels={labels}
                  titleId={
                    isActive ? `${panelId}-teacher-${teacher.id}` : undefined
                  }
                />
              </li>
            );
          })}
        </ul>
      </div>

      {total > 1 ? (
        <div className={css.controls}>
          <button
            type="button"
            className={css.navBtn}
            onClick={() => go(-1)}
            aria-label={labels.prev}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 5 8 12l7 7"
              />
            </svg>
          </button>
          <p className={css.counter} aria-live="polite">
            {labels.counter
              .replace("{current}", String(index + 1))
              .replace("{total}", String(total))}
          </p>
          <button
            type="button"
            className={css.navBtn}
            onClick={() => go(1)}
            aria-label={labels.next}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m9 5 7 7-7 7"
              />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function TeachersPanel({
  teachers,
  features,
  labels,
}: TeachersPanelProps) {
  const panelId = useId();
  const titleId = useId();

  return (
    <section id="teachers" className={css.root} aria-labelledby={titleId}>
      <div className={css.panel}>
        <header className={css.head}>
          <p className={css.kicker}>{labels.kicker}</p>
          <h2 id={titleId} className={css.title}>
            {labels.title}
          </h2>
          <p className={css.lead}>{labels.lead}</p>
        </header>

        <div className={css.body}>
          {teachers.length > 0 ? (
            <TeachersCarousel
              teachers={teachers}
              labels={labels}
              panelId={panelId}
            />
          ) : (
            <p className={css.empty}>{labels.empty}</p>
          )}

          <aside className={css.offer} aria-labelledby={`${panelId}-offer`}>
            <h3 id={`${panelId}-offer`} className={css.offerTitle}>
              {labels.offerTitle}
            </h3>
            <p className={css.offerLead}>{labels.offerLead}</p>
            <ul className={css.offerList}>
              {features.map((feature) => (
                <li key={feature.id} className={css.offerCard}>
                  <h4 className={css.offerCardTitle}>{feature.title}</h4>
                  <p className={css.offerCardText}>{feature.text}</p>
                </li>
              ))}
            </ul>
            <Link href="/register?role=teacher" className={css.joinCta}>
              {labels.joinCta}
            </Link>
          </aside>
        </div>
      </div>
    </section>
  );
}
