import type { AnswerCardVisualState } from "@/modules/testing/answerCardState";

type AnswerStateIconProps = {
  state: AnswerCardVisualState;
  className?: string;
};

/**
 * A non-color signal for the answer card state (Part 7: selected/correct/
 * incorrect must not rely on color alone). Purely decorative — the
 * screen-reader-relevant state is `aria-pressed` on the button plus a
 * visually-hidden status line, so this stays `aria-hidden`.
 */
export function AnswerStateIcon({ state, className }: AnswerStateIconProps) {
  if (state === "default") return null;

  if (state === "correct") {
    return (
      <svg
        className={className}
        aria-hidden="true"
        viewBox="0 0 20 20"
        width="20"
        height="20"
        fill="none"
      >
        <path
          d="M4 10.5 8 14.5 16 6"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (state === "incorrect") {
    return (
      <svg
        className={className}
        aria-hidden="true"
        viewBox="0 0 20 20"
        width="20"
        height="20"
        fill="none"
      >
        <path
          d="M5 5 15 15M15 5 5 15"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg
      className={className}
      aria-hidden="true"
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
    >
      <circle cx="10" cy="10" r="6" fill="currentColor" />
    </svg>
  );
}
