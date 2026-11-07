"use client";

import { useId, useState } from "react";
import css from "./Teachers.module.css";

type TeacherStoryProps = {
  bio: string;
  publicationsLabel: string;
  publications: string;
  moreLabel: string;
  lessLabel: string;
};

/** Full course-teacher biography stays behind a button. The short lead above is the summary. */
export function TeacherStory({
  bio,
  publicationsLabel,
  publications,
  moreLabel,
  lessLabel,
}: TeacherStoryProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className={css.story}>
      <button
        type="button"
        className={css.more}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{open ? lessLabel : moreLabel}</span>
        <svg
          className={open ? css.chevronOpen : css.chevron}
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden
        >
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 9l6 6 6-6"
          />
        </svg>
      </button>
      <div id={panelId} className={css.full} hidden={!open}>
        <p className={css.bio}>{bio}</p>
        <div className={css.publications}>
          <p className={css.publicationsLabel}>{publicationsLabel}</p>
          <p className={css.publicationsText}>{publications}</p>
        </div>
      </div>
    </div>
  );
}
