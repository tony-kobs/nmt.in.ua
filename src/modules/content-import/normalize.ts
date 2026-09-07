import { MYSQL_INT_MAX, MYSQL_INT_MIN } from "./schema";

/**
 * Field-level normalization used identically for CSV cells (always strings)
 * and JSON values (already typed). Each function returns either a value or
 * a short error reason, never throws — callers attach row context.
 */

export type FieldResult<T> = { value: T; error?: undefined } | { value?: undefined; error: string };

const INTEGER_PATTERN = /^-?\d+$/;
/**
 * Longer than any legitimate MySQL `INT` (max 11 characters incl. sign);
 * rejects oversized numeric strings before they reach `Number()`.
 */
const MAX_INTEGER_STRING_LENGTH = 32;

export type IntConstraint = "any" | "positive" | "nonNegative";

/**
 * Parses an integer field and enforces it fits the signed MySQL `INT`
 * column range. `constraint` additionally requires the value to be
 * positive (primary IDs and foreign-key references) or non-negative
 * (`ord`, which may legitimately be `0`).
 */
export function readInt(raw: unknown, constraint: IntConstraint = "any"): FieldResult<number> {
  let value: number;

  if (typeof raw === "number") {
    if (!Number.isSafeInteger(raw)) return { error: "must be a safe integer" };
    value = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (
      trimmed.length === 0 ||
      trimmed.length > MAX_INTEGER_STRING_LENGTH ||
      !INTEGER_PATTERN.test(trimmed)
    ) {
      return { error: "must be an integer" };
    }
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed)) return { error: "must be a safe integer" };
    value = parsed;
  } else {
    return { error: "must be an integer" };
  }

  if (value < MYSQL_INT_MIN || value > MYSQL_INT_MAX) {
    return { error: `must be between ${MYSQL_INT_MIN} and ${MYSQL_INT_MAX}` };
  }
  if (constraint === "positive" && value < 1) {
    return { error: "must be a positive integer" };
  }
  if (constraint === "nonNegative" && value < 0) {
    return { error: "must be a non-negative integer" };
  }
  return { value };
}

export function readString(raw: unknown, maxLength: number): FieldResult<string> {
  if (typeof raw !== "string") return { error: "must be a string" };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { error: "must not be empty" };
  if (trimmed.length > maxLength) {
    return { error: `must be at most ${maxLength} characters` };
  }
  return { value: trimmed };
}

export function readOptionalString(raw: unknown, maxLength: number): FieldResult<string> {
  if (raw === undefined || raw === null) return { value: "" };
  if (typeof raw !== "string") return { error: "must be a string" };
  const trimmed = raw.trim();
  if (trimmed.length > maxLength) {
    return { error: `must be at most ${maxLength} characters` };
  }
  return { value: trimmed };
}
