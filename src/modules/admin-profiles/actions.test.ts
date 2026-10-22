import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteProfileAction,
  setProfileBannedAction,
} from "./actions";
import { AdminProfilesError } from "./types";

const admin = {
  id: 3,
  login: "demo-admin",
  displayName: "Адмін",
  role: "admin" as const,
};

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

test("setProfileBannedAction bans for admin", async () => {
  const state = await setProfileBannedAction(
    { status: "idle" },
    form({ userId: "10", banned: "1" }),
    {
      requireUser: async () => admin,
      setProfileBanned: async () => ({
        id: 10,
        login: "pupil1",
        displayName: "Учень",
        email: "pupil1@example.com",
        emailVerified: true,
        role: "student",
        cabinetScope: "full",
        isBanned: true,
        isOnline: false,
        seenMinutesAgo: null,
        lastLoginAt: null,
        lastSeenAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        deletionDueAt: null,
        telegramLinked: false,
      }),
      deleteProfile: async () => {
        throw new Error("unused");
      },
      promotePlatformStudent: async () => {
        throw new Error("unused");
      },
      revalidatePath: () => undefined,
    },
  );

  assert.equal(state.status, "success");
  if (state.status === "success") {
    assert.equal(state.action, "ban");
    assert.equal(state.displayName, "Учень");
  }
});

test("deleteProfileAction maps last_admin", async () => {
  const state = await deleteProfileAction(
    { status: "idle" },
    form({ userId: "1" }),
    {
      requireUser: async () => admin,
      setProfileBanned: async () => {
        throw new Error("unused");
      },
      deleteProfile: async () => {
        throw new AdminProfilesError("no", "last_admin");
      },
      promotePlatformStudent: async () => {
        throw new Error("unused");
      },
      revalidatePath: () => undefined,
    },
  );
  assert.deepEqual(state, { status: "error", code: "last_admin" });
});

test("setProfileBannedAction forbids non-admin", async () => {
  const state = await setProfileBannedAction(
    { status: "idle" },
    form({ userId: "10", banned: "1" }),
    {
      requireUser: async () => ({
        id: 1,
        login: "demo-student",
        displayName: "Олена",
        role: "student",
      }),
      setProfileBanned: async () => {
        throw new Error("unused");
      },
      deleteProfile: async () => {
        throw new Error("unused");
      },
      promotePlatformStudent: async () => {
        throw new Error("unused");
      },
      revalidatePath: () => undefined,
    },
  );
  assert.deepEqual(state, { status: "error", code: "forbidden" });
});
