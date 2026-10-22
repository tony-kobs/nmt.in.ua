"use client";

import {
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import landing from "../landing.module.css";
import css from "./Teachers.module.css";

export type TeacherOfferItem = {
  id: string;
  title: string;
  text: string;
};

export type LandingTeacherCard = {
  id: string;
  photoSrc: string | null;
  initials: string;
  name: string;
  subjects: string[];
  city: string;
  experience: string;
  languages: string;
  levels: string[];
  headline: string;
  bio: string;
  publications: string;
  studentCount: number;
};

export type TeachersPanelLabels = {
  kicker: string;
  title: string;
  lead: string;
  verified: string;
  city: string;
  experience: string;
  languages: string;
  levels: string;
  reviews: string;
  about: string;
  publications: string;
  readMore: string;
  showLess: string;
  empty: string;
  carouselAria: string;
  prev: string;
  next: string;
  counter: string;
  offerTitle: string;
  offerLead: string;
  joinCta: string;
  stub: string;
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

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2.8a6.2 6.2 0 0 0-6.2 6.2c0 4.6 6.2 12.2 6.2 12.2s6.2-7.6 6.2-12.2A6.2 6.2 0 0 0 12 2.8Zm0 8.4a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4Z"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2.6a9.4 9.4 0 1 0 0 18.8 9.4 9.4 0 0 0 0-18.8Zm.9 4.6v4.5l3.4 2-.9 1.4-4.3-2.6V7.2h1.8Z"
      />
    </svg>
  );
}

function CheckBadge() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="currentColor" />
      <path
        fill="#f6f1e2"
        d="m10.2 14.8-2.5-2.4 1.2-1.2 1.3 1.3 3.8-3.7 1.2 1.2-5 4.8Z"
      />
    </svg>
  );
}

function hasCardText(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== "—" && trimmed !== "-";
}

function descriptionPreview(text: string): { preview: string; canExpand: boolean } {
  const trimmed = text.trim();
  const limit = 160;
  if (trimmed.length <= limit) return { preview: trimmed, canExpand: false };
  const sentence = trimmed.split(/(?<=[.!?…])\s+/)[0] ?? trimmed;
  if (sentence.length < trimmed.length && sentence.length <= limit + 40) {
    return { preview: sentence, canExpand: true };
  }
  const slice = trimmed.slice(0, limit);
  const cut = slice.lastIndexOf(" ");
  const short = (cut > 80 ? slice.slice(0, cut) : slice).trim();
  return { preview: `${short}…`, canExpand: true };
}

function TeacherCard({
  teacher,
  labels,
}: {
  teacher: LandingTeacherCard;
  labels: TeachersPanelLabels;
}) {
  const nameId = useId();
  const bioId = useId();
  const [open, setOpen] = useState(false);
  const bioPreview = descriptionPreview(teacher.bio);
  const publicationsPreview = descriptionPreview(teacher.publications);
  const canExpand =
    (hasCardText(teacher.bio) && bioPreview.canExpand) ||
    hasCardText(teacher.publications);
  const reviews =
    teacher.studentCount > 0
      ? labels.reviews.replace("{count}", String(teacher.studentCount))
      : "";

  return (
    <article className={css.card} aria-labelledby={nameId}>
      <div className={css.photoWrap}>
        {teacher.photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatar API or a local portrait
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
        <p className={css.verified}>
          <CheckBadge />
          {labels.verified}
        </p>
      </div>

      <div className={css.main}>
        <div className={css.nameRow}>
          <h3 id={nameId} className={css.name}>
            {teacher.name}
          </h3>
          <VerifiedShield />
        </div>

        {teacher.subjects.length > 0 ? (
          <ul className={css.chips}>
            {teacher.subjects.map((subject) => (
              <li key={subject} className={css.chip}>
                {subject}
              </li>
            ))}
          </ul>
        ) : null}

        <ul className={css.meta}>
          {hasCardText(teacher.city) ? (
            <li className={css.metaItem}>
              <span className={css.metaIcon} aria-hidden>
                <PinIcon />
              </span>
              <span>
                <span className={css.factLabel}>{labels.city}:</span>{" "}
                {teacher.city}
              </span>
            </li>
          ) : null}
          {hasCardText(teacher.experience) ? (
            <li className={css.metaItem}>
              <span className={css.metaIcon} aria-hidden>
                <ClockIcon />
              </span>
              <span>
                <span className={css.factLabel}>{labels.experience}:</span>{" "}
                {teacher.experience}
              </span>
            </li>
          ) : null}
          {hasCardText(teacher.languages) ? (
            <li className={css.metaItem}>
              <span>
                <span className={css.factLabel}>{labels.languages}:</span>{" "}
                {teacher.languages}
              </span>
            </li>
          ) : null}
          {reviews ? (
            <li className={css.metaItem}>
              <span className={css.reviews}>{reviews}</span>
            </li>
          ) : null}
        </ul>

        {teacher.levels.length > 0 ? (
          <div className={css.levels}>
            <p className={css.factLabel}>{labels.levels}</p>
            <ul className={css.chips}>
              {teacher.levels.map((level) => (
                <li key={level} className={`${css.chip} ${css.levelChip}`}>
                  {level}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {hasCardText(teacher.headline) ? (
          <p className={css.headline}>{teacher.headline}</p>
        ) : null}

        {hasCardText(teacher.bio) || hasCardText(teacher.publications) ? (
          <div className={css.bio}>
            {hasCardText(teacher.bio) ? (
              <p id={bioId} className={css.bioText}>
                {open ? teacher.bio : bioPreview.preview}
              </p>
            ) : (
              <p id={bioId} className={css.bioText}>
                {open ? teacher.publications : publicationsPreview.preview}
              </p>
            )}
            {open && hasCardText(teacher.bio) && hasCardText(teacher.publications) ? (
              <div className={css.publications}>
                <p className={css.factLabel}>{labels.publications}</p>
                <p className={css.bioText}>{teacher.publications}</p>
              </div>
            ) : null}
            {canExpand ? (
              <button
                type="button"
                className={css.more}
                aria-expanded={open}
                aria-controls={bioId}
                onClick={() => setOpen((current) => !current)}
              >
                {open ? labels.showLess : labels.readMore}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function slideStride(viewport: HTMLDivElement): number {
  const slide = viewport.querySelector("li");
  if (!slide) return viewport.clientWidth;
  const styles = getComputedStyle(viewport.querySelector("ul") ?? viewport);
  const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
  return slide.getBoundingClientRect().width + gap;
}

function nearestIndex(viewport: HTMLDivElement): number {
  const slides = [...viewport.querySelectorAll("li")];
  const left = viewport.scrollLeft;
  let nearest = 0;
  let best = Number.POSITIVE_INFINITY;
  slides.forEach((slide, slideIndex) => {
    const distance = Math.abs(slide.offsetLeft - left);
    if (distance < best) {
      best = distance;
      nearest = slideIndex;
    }
  });
  return nearest;
}

function TeachersCarousel({
  teachers,
  labels,
}: {
  teachers: LandingTeacherCard[];
  labels: TeachersPanelLabels;
}) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startScrollRef = useRef(0);
  const startIndexRef = useRef(0);
  const movedRef = useRef(false);
  const total = teachers.length;

  if (total === 0) return null;

  function scrollToIndex(next: number) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const bounded = Math.min(Math.max(next, 0), total - 1);
    const slide = viewport.querySelectorAll("li")[bounded];
    viewport.scrollTo({
      left: slide?.offsetLeft ?? 0,
      behavior: reduceMotion ? "auto" : "smooth",
    });
    setIndex(bounded);
  }

  function go(dir: -1 | 1) {
    const viewport = viewportRef.current;
    const current = viewport ? nearestIndex(viewport) : index;
    scrollToIndex(current + dir);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || total < 2) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("a, button, summary")) return;

    pointerIdRef.current = event.pointerId;
    startXRef.current = event.clientX;
    startScrollRef.current = event.currentTarget.scrollLeft;
    startIndexRef.current = nearestIndex(event.currentTarget);
    movedRef.current = false;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    const delta = event.clientX - startXRef.current;
    if (Math.abs(delta) > 4) movedRef.current = true;
    event.currentTarget.scrollLeft = startScrollRef.current - delta;
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    const delta = event.clientX - startXRef.current;
    const width = slideStride(event.currentTarget);
    const threshold = Math.min(72, width * 0.18);
    if (delta <= -threshold) scrollToIndex(startIndexRef.current + 1);
    else if (delta >= threshold) scrollToIndex(startIndexRef.current - 1);
    else scrollToIndex(startIndexRef.current);

    pointerIdRef.current = null;
    setDragging(false);
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

  function onScroll(event: React.UIEvent<HTMLDivElement>) {
    if (dragging) return;
    setIndex(nearestIndex(event.currentTarget));
  }

  return (
    <div
      className={css.carousel}
      aria-label={labels.carouselAria}
      role="region"
    >
      <div
        ref={viewportRef}
        className={
          total < 2
            ? `${css.viewport} ${css.viewportSingle}`
            : dragging
              ? `${css.viewport} ${css.viewportDragging}`
              : css.viewport
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        onScroll={onScroll}
      >
        <ul className={css.track}>
          {teachers.map((teacher) => (
            <li key={teacher.id} className={css.slide}>
              <TeacherCard teacher={teacher} labels={labels} />
            </li>
          ))}
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
      <div className={landing.container}>
        <div className={css.head}>
          <h2 id={titleId} className={css.title}>
            {labels.title}
          </h2>
          <p className={css.lead}>{labels.lead}</p>
        </div>

        <div className={css.body}>
          <ul className={css.stubs}>
            {teachers.map((teacher) => (
              <li key={teacher.id}>
                <TeacherCard teacher={teacher} labels={labels} />
              </li>
            ))}
            {Array.from({ length: 2 }, (_, index) => (
              <li key={`stub-${index}`}>
                <Link
                  href="/register?role=teacher"
                  className={`${css.card} ${css.stub}`}
                >
                  <div className={css.photoWrap} />
                  <p className={css.stubText}>{labels.stub}</p>
                </Link>
              </li>
            ))}
          </ul>

          <aside className={css.offer} aria-labelledby={`${panelId}-offer`}>
            <div className={css.offerBoard} aria-hidden>
              <span className={`${css.chalk} ${css.chalkX}`}>x²</span>
              <span className={`${css.chalk} ${css.chalkPi}`}>π r²</span>
              <span className={`${css.chalk} ${css.chalkInt}`}>∫ f(x) dx</span>
              <span className={css.dotLime} />
              <span className={css.dotSun} />
              <svg className={css.chalkTri} viewBox="0 0 48 40">
                <path
                  d="M6 34h36V6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </div>
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
