"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { NestedErrorProvider, useFormIssues, type NestedFormError } from "./ValidatedForm";
import { readSectionOpen, writeSectionOpen } from "./settingsSections";
import css from "../marathon.module.css";

const listeners = new Set<() => void>();
const cache = new Map<string, string | null>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener();
}

function readCached(storageKey: string): string | null {
  if (cache.has(storageKey)) return cache.get(storageKey) ?? null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey);
  } catch {
    raw = null;
  }
  cache.set(storageKey, raw);
  return raw;
}

function publishOpen(storageKey: string, id: string, open: boolean) {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey);
  } catch {
    raw = cache.get(storageKey) ?? null;
  }
  const next = writeSectionOpen(raw, id, open);
  try {
    window.localStorage.setItem(storageKey, next);
  } catch {
    // Private mode or a full disk: keep the value for this tab only.
  }
  cache.set(storageKey, next);
  emit();
}

function rememberOpen(storageKey: string, id: string) {
  try {
    const next = writeSectionOpen(window.localStorage.getItem(storageKey), id, true);
    window.localStorage.setItem(storageKey, next);
  } catch {
    // The section still opens in memory for this visit.
  }
}

function useStoredOpen(storageKey: string, id: string, defaultOpen: boolean) {
  const raw = useSyncExternalStore(subscribe, () => readCached(storageKey), () => null);
  const stored = readSectionOpen(raw, id);
  const setOpen = useCallback(
    (open: boolean) => publishOpen(storageKey, id, open),
    [storageKey, id],
  );
  return [stored === null ? defaultOpen : stored, setOpen] as const;
}

function scrollTo(element: HTMLElement) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

export function AccordionGroup({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { attempt } = useFormIssues();

  useEffect(() => {
    if (!attempt) return;
    const section = ref.current?.querySelector<HTMLElement>("[data-section-invalid='true']");
    if (!section) return;
    scrollTo(section);
    section.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [attempt]);

  return (
    <div ref={ref} className={css.stack}>
      {children}
    </div>
  );
}

export function AccordionSection({
  id,
  title,
  summary,
  fields = [],
  storageKey,
  defaultOpen = false,
  headingLevel = "h2",
  keepSummary = false,
  forceOpen = false,
  children,
}: {
  id: string;
  title: string;
  summary?: string;
  fields?: readonly string[];
  storageKey: string;
  defaultOpen?: boolean;
  headingLevel?: "h2" | "h3";
  /** Leave the count line visible after the section is opened. */
  keepSummary?: boolean;
  /** Search and validation can open a section without writing that choice to storage. */
  forceOpen?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("Marathon");
  const uid = useId();
  const panelId = `${uid}-panel`;
  const buttonId = `${uid}-toggle`;
  const sectionRef = useRef<HTMLElement>(null);
  const [storedOpen, setStoredOpen] = useStoredOpen(storageKey, id, defaultOpen);
  const [forced, setForced] = useState(false);
  const [nested, setNested] = useState<Record<string, NestedFormError>>({});
  const { issues, attempt } = useFormIssues();
  const ownCount = fields.filter((field) => issues.some((issue) => issue.field === field)).length;
  const nestedCount = Object.values(nested).reduce((sum, item) => sum + item.count, 0);
  const errorCount = ownCount + nestedCount;
  const nestedAttempt = Object.values(nested).reduce(
    (max, item) => (item.count > 0 ? Math.max(max, item.attempt) : max),
    0,
  );
  const [prevAttempt, setPrevAttempt] = useState(attempt);
  const [prevNested, setPrevNested] = useState(nestedAttempt);
  if (attempt !== prevAttempt) {
    setPrevAttempt(attempt);
    if (attempt > 0 && ownCount > 0) {
      setForced(true);
      rememberOpen(storageKey, id);
    }
  }
  if (nestedAttempt !== prevNested) {
    setPrevNested(nestedAttempt);
    if (nestedAttempt > 0) {
      setForced(true);
      rememberOpen(storageKey, id);
    }
  }
  const open = forceOpen || forced || storedOpen;
  const Heading = headingLevel;

  const report = useCallback((formId: string, next: NestedFormError) => {
    setNested((prev) => {
      const current = prev[formId];
      if (current && current.count === next.count && current.attempt === next.attempt) return prev;
      return { ...prev, [formId]: next };
    });
  }, []);

  useEffect(() => {
    if (!nestedAttempt || !sectionRef.current) return;
    scrollTo(sectionRef.current);
  }, [nestedAttempt]);

  function toggle() {
    setForced(false);
    setStoredOpen(!open);
  }

  return (
    <section
      ref={sectionRef}
      className={errorCount > 0 ? `${css.section} ${css.sectionInvalid}` : css.section}
      id={id}
      data-section={id}
      data-section-invalid={errorCount > 0 ? "true" : "false"}
      aria-labelledby={buttonId}
    >
      <Heading className={css.sectionHeading}>
        <button
          type="button"
          id={buttonId}
          className={css.sectionToggle}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
        >
          <span className={css.sectionTitle}>{title}</span>
          {summary && (keepSummary || !open) ? <span className={css.sectionSummary}>{summary}</span> : null}
          {errorCount > 0 ? (
            <span className={css.sectionBadge} aria-label={t("sections.errorBadge", { count: errorCount })}>
              {errorCount}
            </span>
          ) : null}
          <svg
            className={open ? css.sectionChevronOpen : css.sectionChevron}
            width="20"
            height="20"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              d="M5 7.5 10 12.5 15 7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </Heading>
      <div id={panelId} role="region" aria-labelledby={buttonId} className={css.sectionPanel} hidden={!open}>
        <NestedErrorProvider report={report}>{children}</NestedErrorProvider>
      </div>
    </section>
  );
}
