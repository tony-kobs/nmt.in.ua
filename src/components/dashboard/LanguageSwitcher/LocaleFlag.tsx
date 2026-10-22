import { useId } from "react";

type LocaleFlagProps = {
  locale: "uk" | "en" | "de";
};

/** Круглий прапор мови: Україна, Велика Британія, Німеччина. */
export function LocaleFlag({ locale }: LocaleFlagProps) {
  const clipId = `${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-flag`;

  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {locale === "uk" ? <Ukraine /> : null}
        {locale === "en" ? <UnitedKingdom /> : null}
        {locale === "de" ? <Germany /> : null}
      </g>
    </svg>
  );
}

function Ukraine() {
  return (
    <>
      <rect width="24" height="12" fill="#0057B8" />
      <rect y="12" width="24" height="12" fill="#FFD700" />
    </>
  );
}

function Germany() {
  return (
    <>
      <rect width="24" height="8" fill="#000000" />
      <rect y="8" width="24" height="8" fill="#DD0000" />
      <rect y="16" width="24" height="8" fill="#FFCE00" />
    </>
  );
}

function UnitedKingdom() {
  return (
    <>
      <rect width="24" height="24" fill="#012169" />
      <path d="M0 0 24 24M24 0 0 24" stroke="#FFFFFF" strokeWidth="5" />
      <path d="M0 0 24 24M24 0 0 24" stroke="#C8102E" strokeWidth="2.4" />
      <path d="M12 0v24M0 12h24" stroke="#FFFFFF" strokeWidth="8" />
      <path d="M12 0v24M0 12h24" stroke="#C8102E" strokeWidth="4.5" />
    </>
  );
}
