import css from "./navIcons.module.css";

/** One sprite for the cabinet rail. Ids are `nav-*`. */
export const NAV_ICON_NAMES = [
  "mail",
  "cap",
  "flame",
  "chart",
  "book",
  "notebook",
  "spark",
  "bolt",
  "target",
  "timer",
  "trophy",
  "sun",
  "chat",
  "gear",
  "id",
  "pencil",
  "pen",
  "headset",
  "flag",
] as const;

export type NavIconName = (typeof NAV_ICON_NAMES)[number];

const stroke = {
  fill: "none",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function NavSprite() {
  return (
    <svg className={css.sprite} aria-hidden focusable="false">
      <symbol id="nav-mail" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="#2563eb" {...stroke} />
        <path d="M4 7.5 12 13l8-5.5" stroke="#2563eb" {...stroke} />
      </symbol>
      <symbol id="nav-cap" viewBox="0 0 24 24">
        <path d="M2.5 10 12 5.5 21.5 10 12 14.5 2.5 10Z" stroke="#0f766e" {...stroke} />
        <path d="M6.5 11.8v3.4c0 .4 2.4 2.3 5.5 2.3s5.5-1.9 5.5-2.3v-3.4" stroke="#0f766e" {...stroke} />
        <path d="M21.5 10v5.2" stroke="#0f766e" {...stroke} />
      </symbol>
      <symbol id="nav-flame" viewBox="0 0 24 24">
        <path
          d="M12 2.2c.4 2.8-1 4.4-2.2 6.1C8.4 10.2 7.4 11.8 7.4 13.8a4.6 4.6 0 0 0 9.2 0c0-2.3-1.3-4-2.5-5.8.9 1.5.8 2.8.2 4-1.5-2.6-2.3-5.4-2.3-9.8Z"
          fill="#ea580c"
          stroke="#c2410c"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </symbol>
      <symbol id="nav-chart" viewBox="0 0 24 24">
        <path d="M4 19.5h16" stroke="#7c3aed" {...stroke} />
        <path d="M7 19.5v-5" stroke="#7c3aed" {...stroke} />
        <path d="M12 19.5V7.5" stroke="#7c3aed" {...stroke} />
        <path d="M17 19.5v-8" stroke="#7c3aed" {...stroke} />
      </symbol>
      <symbol id="nav-book" viewBox="0 0 24 24">
        <path
          d="M12 6.2C10.2 4.8 7.6 4.2 4 4.6v13c3.4-.3 6.1.3 8 1.8 1.9-1.5 4.6-2.1 8-1.8v-13c-3.6-.4-6.2.2-8 1.6Z"
          stroke="#b45309"
          {...stroke}
        />
        <path d="M12 6.2v13.2" stroke="#b45309" {...stroke} />
      </symbol>
      <symbol id="nav-notebook" viewBox="0 0 24 24">
        <path d="M7 4.5h8.5A2.5 2.5 0 0 1 18 7v11.2a2.3 2.3 0 0 1-2.3 2.3H7A2.5 2.5 0 0 1 4.5 18V7A2.5 2.5 0 0 1 7 4.5Z" stroke="#0e7490" {...stroke} />
        <path d="M8.5 8.5h5.5M8.5 12h5.5M8.5 15.5h3" stroke="#0e7490" {...stroke} />
        <path d="m15.2 14.2 3.2-3.2 1.6 1.6-3.2 3.2h-1.6v-1.6Z" stroke="#0e7490" {...stroke} />
      </symbol>
      <symbol id="nav-spark" viewBox="0 0 24 24">
        <path d="M12 2.8 13.6 8 19 9.6 13.6 11.2 12 16.4 10.4 11.2 5 9.6 10.4 8 12 2.8Z" fill="#eab308" stroke="#a16207" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M18 14.2 18.7 16l1.8.7-1.8.7L18 19.2l-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" fill="#f59e0b" />
        <path d="m6.2 15 .5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5.5-1.3Z" fill="#fbbf24" />
      </symbol>
      <symbol id="nav-bolt" viewBox="0 0 24 24">
        <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="#4f46e5" {...stroke} />
        <path d="M13 7.2 9.2 13H12l-.8 3.8 3.8-5.8H12l1-3.8Z" fill="#4f46e5" stroke="#4f46e5" strokeWidth="1.2" strokeLinejoin="round" />
      </symbol>
      <symbol id="nav-target" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="7.5" stroke="#be123c" {...stroke} />
        <circle cx="12" cy="12" r="3.5" stroke="#be123c" {...stroke} />
        <circle cx="12" cy="12" r="1.2" fill="#be123c" />
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2" stroke="#be123c" {...stroke} />
      </symbol>
      <symbol id="nav-timer" viewBox="0 0 24 24">
        <circle cx="12" cy="13.5" r="6.8" stroke="#0369a1" {...stroke} />
        <path d="M12 13.5V9.6" stroke="#0369a1" {...stroke} />
        <path d="M9.2 3.2h5.6" stroke="#0369a1" {...stroke} />
        <path d="M12 3.2v2.4" stroke="#0369a1" {...stroke} />
        <path d="m16.8 6.2 1.3-1.3" stroke="#0369a1" {...stroke} />
      </symbol>
      <symbol id="nav-sun" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3.2" stroke="#d97706" {...stroke} />
        <path d="M12 3.2v2.2M12 18.6v2.2M3.2 12h2.2M18.6 12h2.2M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" stroke="#d97706" {...stroke} />
      </symbol>
      <symbol id="nav-chat" viewBox="0 0 24 24">
        <path d="M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 19 16.5H9.5L5 19.5v-11A1.5 1.5 0 0 1 6.5 6.5H5Z" stroke="#0f766e" {...stroke} />
        <path d="M8.5 11h7M8.5 13.5h4" stroke="#0f766e" {...stroke} />
      </symbol>
      <symbol id="nav-gear" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" stroke="#44403c" {...stroke} />
        <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6" stroke="#44403c" {...stroke} />
      </symbol>
      <symbol id="nav-id" viewBox="0 0 24 24">
        <rect x="3.5" y="5.5" width="17" height="13" rx="2.2" stroke="#6d28d9" {...stroke} />
        <circle cx="9" cy="11" r="1.7" stroke="#6d28d9" {...stroke} />
        <path d="M6.8 15.2c.5-1.2 1.4-1.8 2.2-1.8s1.7.6 2.2 1.8M13.2 10.2h4.2M13.2 13.2h4.2" stroke="#6d28d9" {...stroke} />
      </symbol>
      <symbol id="nav-pencil" viewBox="0 0 24 24">
        <path d="M4.5 19.5 5.6 15 15.2 5.4a1.6 1.6 0 0 1 2.3 0l1.1 1.1a1.6 1.6 0 0 1 0 2.3L9 18.4 4.5 19.5Z" stroke="#0f766e" {...stroke} />
        <path d="m13.8 6.8 3.4 3.4" stroke="#0f766e" {...stroke} />
      </symbol>
      <symbol id="nav-pen" viewBox="0 0 24 24">
        <path d="M6 5.5h8.2A2.3 2.3 0 0 1 16.5 7.8V19L12 16.6 7.5 19V7.8A2.3 2.3 0 0 1 6 5.5Z" stroke="#b45309" {...stroke} />
        <path d="M9 9.2h4.2M9 12h3" stroke="#b45309" {...stroke} />
      </symbol>
      <symbol id="nav-headset" viewBox="0 0 24 24">
        <path d="M5 13.5v-1a7 7 0 0 1 14 0v1" stroke="#be123c" {...stroke} />
        <path d="M5 13.2h2.2A1.3 1.3 0 0 1 8.5 14.5v3A1.3 1.3 0 0 1 7.2 18.8H5.8A1.3 1.3 0 0 1 4.5 17.5v-3A1.3 1.3 0 0 1 5 13.2Z" stroke="#be123c" {...stroke} />
        <path d="M19 13.2h-2.2A1.3 1.3 0 0 0 15.5 14.5v3a1.3 1.3 0 0 0 1.3 1.3h1.4a1.3 1.3 0 0 0 1.3-1.3v-3a1.3 1.3 0 0 0-.8-1.3Z" stroke="#be123c" {...stroke} />
      </symbol>
      <symbol id="nav-flag" viewBox="0 0 24 24">
        <path d="M6 4.5v15" stroke="#c2410c" {...stroke} />
        <path d="M6 5.5h10.5l-2 3.2 2 3.3H6" stroke="#c2410c" {...stroke} />
      </symbol>
      <symbol id="nav-trophy" viewBox="0 0 24 24">
        <path d="M8 4h8v6.2a4 4 0 0 1-8 0V4Z" fill="#f59e0b" stroke="#b45309" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M8 6.2H5.6a2.4 2.4 0 0 0 2.4 4" stroke="#b45309" {...stroke} />
        <path d="M16 6.2h2.4a2.4 2.4 0 0 1-2.4 4" stroke="#b45309" {...stroke} />
        <path d="M12 14.2v2.2" stroke="#b45309" {...stroke} />
        <path d="M9.2 20h5.6" stroke="#b45309" {...stroke} />
        <path d="M10 16.4h4v2.2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-2.2Z" fill="#fbbf24" stroke="#b45309" strokeWidth="1.4" />
      </symbol>
    </svg>
  );
}

export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <span className={css.tile} data-nav-icon={name}>
      <svg className={css.glyph} viewBox="0 0 24 24" aria-hidden focusable="false">
        <use href={`#nav-${name}`} />
      </svg>
    </span>
  );
}
