"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { useIsClient } from "@/lib/useIsClient";
import { findTypeaheadIndex, isTypeaheadChar } from "./findTypeaheadIndex";
import { placeMenu } from "./placeMenu";
import css from "./Select.module.css";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type MenuBox = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

type SelectProps = {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  options: readonly SelectOption[];
  onChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  variant?: "field" | "compact";
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-busy"?: boolean;
  title?: string;
};

const TYPEAHEAD_MS = 500;

function enabledIndexes(options: readonly SelectOption[]): number[] {
  return options.flatMap((option, index) => (option.disabled ? [] : [index]));
}

function measureMenu(
  trigger: HTMLElement,
  variant: "field" | "compact",
): MenuBox {
  const rect = trigger.getBoundingClientRect();
  return placeMenu({
    top: rect.top,
    left: rect.left,
    bottom: rect.bottom,
    width: rect.width,
    minWidth: variant === "compact" ? 8.5 * 16 : rect.width,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });
}

function showMenuLayer(node: HTMLElement) {
  const layer = node as HTMLElement & { showPopover?: () => void };
  if (typeof layer.showPopover !== "function") return;
  try {
    if (!node.matches(":popover-open")) layer.showPopover();
  } catch {
    // The menu is already in the top layer.
  }
}

export function Select({
  id,
  name,
  value,
  defaultValue = "",
  options,
  onChange,
  disabled = false,
  required = false,
  placeholder,
  variant = "field",
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-invalid": ariaInvalid,
  "aria-busy": ariaBusy,
  title,
}: SelectProps) {
  const isControlled = value !== undefined;
  const cannotOpen = disabled || options.length === 0;
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const current = isControlled ? value : uncontrolled;
  const listId = useId();
  const triggerId = id ?? `${listId}-trigger`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef({ query: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [box, setBox] = useState<MenuBox | null>(null);
  const portalReady = useIsClient();
  const isOpen = open && !cannotOpen;

  const selectedIndex = options.findIndex((option) => option.value === current);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const commit = useCallback(
    (next: string) => {
      if (!isControlled) setUncontrolled(next);
      onChange?.(next);
    },
    [isControlled, onChange],
  );

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const updateBox = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setBox(measureMenu(trigger, variant));
  }, [variant]);

  const openMenu = useCallback(
    (nextHighlight?: number) => {
      if (cannotOpen) return;
      const enabled = enabledIndexes(options);
      const fallback =
        selectedIndex >= 0 && !options[selectedIndex]?.disabled
          ? selectedIndex
          : (enabled[0] ?? 0);
      setHighlight(nextHighlight ?? fallback);
      const trigger = triggerRef.current;
      if (trigger) setBox(measureMenu(trigger, variant));
      setOpen(true);
    },
    [cannotOpen, options, selectedIndex, variant],
  );

  useEffect(() => {
    if (!isOpen) return;
    const node = menuRef.current;
    if (node) showMenuLayer(node);
    updateBox();
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      close();
    };
    const onReposition = () => updateBox();
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [isOpen, close, updateBox]);

  useEffect(() => {
    if (!isOpen) return;
    document
      .getElementById(`${listId}-opt-${highlight}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [isOpen, highlight, listId]);

  function pick(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    commit(option.value);
    close();
    triggerRef.current?.focus();
  }

  function moveHighlight(delta: number) {
    const enabled = enabledIndexes(options);
    if (enabled.length === 0) return;
    const at = enabled.indexOf(highlight);
    const from = at >= 0 ? at : 0;
    const next = enabled[(from + delta + enabled.length) % enabled.length]!;
    setHighlight(next);
  }

  function typeahead(key: string) {
    const now = Date.now();
    const prev = typeaheadRef.current;
    const repeating =
      prev.query.length > 0 &&
      [...prev.query].every((char) => char === key) &&
      key === prev.query[0];
    const query =
      now - prev.at > TYPEAHEAD_MS ? key : repeating ? key : `${prev.query}${key}`;
    typeaheadRef.current = { query, at: now };

    const labels = options.map((option) => option.label);
    const from = repeating ? highlight + 1 : highlight;
    const index = findTypeaheadIndex(labels, repeating ? key : query, from);
    if (index < 0 || options[index]?.disabled) return;
    if (isOpen) {
      setHighlight(index);
      return;
    }
    commit(options[index]!.value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (cannotOpen) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) openMenu();
      else moveHighlight(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) openMenu();
      else moveHighlight(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      const first = enabledIndexes(options)[0];
      if (first == null) return;
      if (!isOpen) openMenu(first);
      else setHighlight(first);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      const enabled = enabledIndexes(options);
      const last = enabled[enabled.length - 1];
      if (last == null) return;
      if (!isOpen) openMenu(last);
      else setHighlight(last);
      return;
    }
    if (event.key === "Escape") {
      if (!isOpen) return;
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!isOpen) {
        openMenu();
        return;
      }
      pick(highlight);
      return;
    }
    if (isTypeaheadChar(event.key)) {
      event.preventDefault();
      typeahead(event.key);
    }
  }

  const triggerLabel = selected?.label ?? placeholder ?? "";
  const showPlaceholder = !selected;
  const activeId = isOpen ? `${listId}-opt-${highlight}` : undefined;

  return (
    <div
      className={clsx(css.root, variant === "compact" && css.rootCompact, className)}
    >
      {name ? (
        <input type="hidden" name={name} value={current} required={required} />
      ) : null}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={clsx(
          css.trigger,
          variant === "compact" && css.triggerCompact,
          isOpen && css.triggerOpen,
        )}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        aria-activedescendant={activeId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-invalid={ariaInvalid}
        aria-busy={ariaBusy}
        aria-required={required || undefined}
        title={title}
        disabled={cannotOpen}
        onClick={() => {
          if (isOpen) close();
          else openMenu();
        }}
        onKeyDown={onKeyDown}
      >
        <span className={clsx(css.value, showPlaceholder && css.placeholder)}>
          {triggerLabel}
        </span>
        <svg
          className={clsx(css.chevron, isOpen && css.chevronOpen)}
          width="12"
          height="8"
          viewBox="0 0 12 8"
          fill="none"
          aria-hidden
        >
          <path
            d="M1 1.5 6 6.5 11 1.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {portalReady && isOpen && box
        ? createPortal(
            <div
                  ref={menuRef}
                  id={listId}
                  className={css.menu}
                  role="listbox"
                  popover="manual"
                  aria-labelledby={triggerId}
                  style={{
                    position: "fixed",
                    top: box.top,
                    left: box.left,
                    right: "auto",
                    bottom: "auto",
                    width: box.width,
                    height: "auto",
                    maxHeight: box.maxHeight,
                    margin: 0,
                  }}
                >
                  {options.map((option, index) => {
                    const active = index === highlight;
                    const isSelected = option.value === current;
                    return (
                      <div
                        key={option.value || `empty-${index}`}
                        id={`${listId}-opt-${index}`}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={option.disabled || undefined}
                        className={clsx(
                          css.option,
                          active && css.optionActive,
                          isSelected && css.optionSelected,
                        )}
                        onMouseEnter={() => {
                          if (!option.disabled) setHighlight(index);
                        }}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => pick(index)}
                      >
                        <span>{option.label}</span>
                        {isSelected ? (
                          <svg
                            className={css.check}
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            aria-hidden
                          >
                            <path
                              d="M3.5 8.5 6.5 11.5 12.5 4.5"
                              stroke="currentColor"
                              strokeWidth="1.75"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : null}
                      </div>
                    );
                  })}
                </div>,
            document.body,
          )
        : null}
    </div>
  );
}
