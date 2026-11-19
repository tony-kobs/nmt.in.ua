export const TABLES = [2, 3, 4, 5, 6, 7, 8, 9] as const;
export type Table = (typeof TABLES)[number];

export const EXERCISES_COUNT = 10;
export const MAX_POINTS = 10;
export const MAX_SECONDS = 20;
export const MAX_INPUT_LENGTH = 3;

export function isTable(value: number): value is Table {
  return (TABLES as readonly number[]).includes(value);
}
