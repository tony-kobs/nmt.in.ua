export type NotificationSnapshot = {
  id: number;
  userId: number;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  readAt: string | null;
};

export function notificationIdentity(input: {
  userId: number;
  kind: string;
  link: string | null;
}): string {
  return `${input.userId}\0${input.kind}\0${input.link ?? ""}`;
}

/** `once` skips a second row with the same user, kind and link. */
export function shouldInsertNotification(
  existing: Array<Pick<NotificationSnapshot, "userId" | "kind" | "link">>,
  input: { userId: number; kind: string; link: string | null; once?: boolean },
): boolean {
  if (!input.once) return true;
  const key = notificationIdentity(input);
  return !existing.some((row) => notificationIdentity(row) === key);
}

export function unreadCount(
  rows: Array<Pick<NotificationSnapshot, "readAt">>,
): number {
  return rows.reduce((count, row) => count + (row.readAt ? 0 : 1), 0);
}

export function markNotificationsRead<T extends NotificationSnapshot>(
  rows: T[],
  input: { userId: number; id?: number; all?: boolean; now: string },
): T[] {
  return rows.map((row) => {
    if (row.userId !== input.userId || row.readAt) return row;
    const hit = input.all || (input.id != null && row.id === input.id);
    if (!hit) return row;
    return { ...row, readAt: input.now };
  });
}
