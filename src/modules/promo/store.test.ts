import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import {
  createPromoCode,
  getStudentAccess,
  listPromoCodes,
  parseKyivDateTimeLocal,
  redeemPromo,
  resolveTeacherRef,
  setPromoActive,
} from "./store";

type User = {
  id: number;
  role: string;
  display_name: string;
  is_banned: number;
};
type Code = {
  id: number;
  code: string;
  teacher_id: number | null;
  access_days: number;
  max_uses: number | null;
  expires_at: Date | null;
  active: number;
  created_by: number;
};
type Redemption = {
  id: number;
  promo_code_id: number;
  user_id: number;
  access_until: Date;
};

function world() {
  const users: User[] = [
    { id: 2, role: "teacher", display_name: "Марія Коваль", is_banned: 0 },
    { id: 3, role: "teacher", display_name: "Ігор Петренко", is_banned: 0 },
    { id: 8, role: "teacher", display_name: "Забанений", is_banned: 1 },
    { id: 5, role: "student", display_name: "Оленка", is_banned: 0 },
    { id: 6, role: "student", display_name: "Тарас", is_banned: 0 },
    { id: 4, role: "parent", display_name: "Батько", is_banned: 0 },
    { id: 9, role: "admin", display_name: "Адмін", is_banned: 0 },
  ];
  const profiles = [
    { user_id: 2, slug: "maria" },
    { user_id: 3, slug: "ihor" },
    { user_id: 8, slug: "banned" },
  ];
  const codes: Code[] = [];
  const redemptions: Redemption[] = [];
  const links: Array<{ teacher_user_id: number; student_user_id: number }> = [];
  let nextCode = 1;
  let nextRedemption = 1;

  const connection: SqlConnection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async <T,>(sql: string, params: unknown[] = []) => {
      if (sql.includes("schema_migrations")) {
        return params.map((version) => ({ version })) as T[];
      }
      if (sql.includes("GET_LOCK") || sql.includes("RELEASE_LOCK")) {
        return [{ got: 1, released: 1 }] as T[];
      }
      if (sql.includes("information_schema")) return [] as T[];
      if (sql.includes("AS used_count")) {
        const teacherFilter = sql.includes("WHERE c.teacher_id");
        const visible = teacherFilter
          ? codes.filter((row) => row.teacher_id === Number(params[0]))
          : codes;
        return [...visible].reverse().map((code) => ({
          id: code.id,
          code: code.code,
          teacher_id: code.teacher_id,
          teacher_name: users.find((user) => user.id === code.teacher_id)?.display_name ?? null,
          access_days: code.access_days,
          max_uses: code.max_uses,
          expires_at: code.expires_at,
          active: code.active,
          used_count: redemptions.filter((row) => row.promo_code_id === code.id).length,
        })) as T[];
      }
      if (sql.includes("COUNT(*) AS used")) {
        const id = Number(params[0]);
        return [{ used: redemptions.filter((row) => row.promo_code_id === id).length }] as T[];
      }
      if (sql.includes("SELECT id FROM promo_redemptions")) {
        const found = redemptions.find(
          (row) => row.promo_code_id === Number(params[0]) && row.user_id === Number(params[1]),
        );
        return (found ? [{ id: found.id }] : []) as T[];
      }
      if (sql.includes("MAX(access_until)")) {
        const own = redemptions.filter((row) => row.user_id === Number(params[0]));
        const until = own.reduce<Date | null>((max, row) => {
          if (!max || row.access_until.getTime() > max.getTime()) return row.access_until;
          return max;
        }, null);
        return [{ until }] as T[];
      }
      if (sql.includes("promo_redemptions r")) {
        const ids = new Set(params.map((value) => Number(value)));
        return redemptions
          .filter((row) => ids.has(row.promo_code_id))
          .sort((a, b) => b.id - a.id)
          .map((row) => ({
            promo_code_id: row.promo_code_id,
            display_name: users.find((user) => user.id === row.user_id)?.display_name ?? "",
          })) as T[];
      }
      if (sql.includes("teacher_students ts")) {
        return links
          .filter((link) => link.student_user_id === Number(params[0]))
          .map((link) => ({
            display_name: users.find((user) => user.id === link.teacher_user_id)?.display_name ?? "",
          })) as T[];
      }
      if (sql.includes("FROM teacher_profiles")) {
        const profile = profiles.find((row) => row.slug === params[0]);
        const user = users.find((row) => row.id === profile?.user_id);
        return (user ? [user] : []) as T[];
      }
      if (sql.includes("WHERE c.code")) {
        const code = codes.find((row) => row.code === params[0]);
        if (!code) return [] as T[];
        const teacher = users.find((row) => row.id === code.teacher_id);
        return [{
          id: code.id,
          code: code.code,
          teacher_id: code.teacher_id,
          access_days: code.access_days,
          max_uses: code.max_uses,
          expires_at: code.expires_at,
          active: code.active,
          teacher_name: teacher?.display_name ?? null,
          teacher_role: teacher?.role ?? null,
          teacher_banned: teacher?.is_banned ?? null,
        }] as T[];
      }
      if (sql.includes("FROM app_users")) {
        const user = users.find((row) => row.id === Number(params[0]));
        return (user ? [user] : []) as T[];
      }
      return [] as T[];
    },
    execute: async (sql, params = []) => {
      if (
        sql.includes("CREATE TABLE") ||
        sql.includes("ALTER TABLE") ||
        sql.includes("ADD COLUMN") ||
        sql.includes("ADD UNIQUE")
      ) {
        return { insertId: 0, affectedRows: 0 };
      }
      if (sql.includes("INSERT INTO promo_codes")) {
        const code = String(params[0]);
        if (codes.some((row) => row.code.toLowerCase() === code.toLowerCase())) {
          throw Object.assign(new Error("Duplicate entry"), { errno: 1062 });
        }
        const id = nextCode;
        nextCode += 1;
        codes.push({
          id,
          code,
          teacher_id: params[1] == null ? null : Number(params[1]),
          access_days: Number(params[2]),
          max_uses: params[3] == null ? null : Number(params[3]),
          expires_at: params[4] instanceof Date ? params[4] : null,
          active: 1,
          created_by: Number(params[5]),
        });
        return { insertId: id, affectedRows: 1 };
      }
      if (sql.includes("UPDATE promo_codes")) {
        const active = Number(params[0]);
        const id = Number(params[1]);
        const teacherId = params.length > 2 ? Number(params[2]) : null;
        const code = codes.find((row) => row.id === id);
        if (!code || (teacherId != null && code.teacher_id !== teacherId)) {
          return { insertId: 0, affectedRows: 0 };
        }
        code.active = active;
        return { insertId: 0, affectedRows: 1 };
      }
      if (sql.includes("INSERT INTO promo_redemptions")) {
        const promoId = Number(params[0]);
        const userId = Number(params[1]);
        if (redemptions.some((row) => row.promo_code_id === promoId && row.user_id === userId)) {
          throw Object.assign(new Error("Duplicate entry"), { errno: 1062 });
        }
        const id = nextRedemption;
        nextRedemption += 1;
        redemptions.push({
          id,
          promo_code_id: promoId,
          user_id: userId,
          access_until: params[2] as Date,
        });
        return { insertId: id, affectedRows: 1 };
      }
      if (sql.includes("INSERT INTO teacher_students")) {
        const teacherId = Number(params[0]);
        const studentId = Number(params[1]);
        if (links.some((row) => row.teacher_user_id === teacherId && row.student_user_id === studentId)) {
          throw Object.assign(new Error("Duplicate entry"), { errno: 1062 });
        }
        links.push({ teacher_user_id: teacherId, student_user_id: studentId });
        return { insertId: 0, affectedRows: 1 };
      }
      return { insertId: 0, affectedRows: 0 };
    },
  };

  const deps = { getConnection: async () => connection };
  return { deps, codes, redemptions, links };
}

const NOW = new Date("2026-06-01T12:00:00.000Z");

test("a teacher code is bound to that teacher even if another ref is typed", async () => {
  const { deps, codes } = world();
  const created = await createPromoCode(
    {
      actorId: 2,
      actorRole: "teacher",
      code: "open-day",
      accessDays: "14",
      maxUses: "",
      expiresAt: "",
      teacherRef: "ihor",
    },
    deps,
  );
  assert.deepEqual(created, { ok: true, id: 1 });
  assert.equal(codes[0]?.code, "OPEN-DAY");
  assert.equal(codes[0]?.teacher_id, 2);
  assert.equal(codes[0]?.max_uses, null);
});

test("an admin can bind a slug and cannot invent a teacher", async () => {
  const { deps, codes } = world();
  const created = await createPromoCode(
    {
      actorId: 9,
      actorRole: "admin",
      code: "MATH-1",
      accessDays: 7,
      maxUses: "2",
      expiresAt: "2026-12-01T18:00",
      teacherRef: "ihor",
    },
    deps,
  );
  assert.equal(created.ok, true);
  assert.equal(codes[0]?.teacher_id, 3);
  assert.ok(codes[0]?.expires_at instanceof Date);
  const missing = await createPromoCode(
    {
      actorId: 9,
      actorRole: "admin",
      code: "MATH-2",
      accessDays: 7,
      maxUses: "",
      expiresAt: "",
      teacherRef: "nobody",
    },
    deps,
  );
  assert.deepEqual(missing, { ok: false, code: "teacher_not_found" });
});

test("a duplicate code and a non-teacher are rejected", async () => {
  const { deps } = world();
  await createPromoCode(
    {
      actorId: 9,
      actorRole: "dev",
      code: "OPENDAY",
      accessDays: 3,
      maxUses: "",
      expiresAt: "",
      teacherRef: "",
    },
    deps,
  );
  const again = await createPromoCode(
    {
      actorId: 9,
      actorRole: "admin",
      code: "openday",
      accessDays: 3,
      maxUses: "",
      expiresAt: "",
      teacherRef: "",
    },
    deps,
  );
  assert.deepEqual(again, { ok: false, code: "code_taken" });
  const parent = await createPromoCode(
    {
      actorId: 4,
      actorRole: "parent",
      code: "PARENT",
      accessDays: 3,
      maxUses: "",
      expiresAt: "",
      teacherRef: "",
    },
    deps,
  );
  assert.deepEqual(parent, { ok: false, code: "forbidden" });
});

test("redeem grants days, links the teacher, and stacks the next code", async () => {
  const { deps, links } = world();
  const clock = { ...deps, now: () => NOW };
  await createPromoCode(
    {
      actorId: 2,
      actorRole: "teacher",
      code: "TENDAYS",
      accessDays: 10,
      maxUses: "",
      expiresAt: "",
      teacherRef: "",
    },
    deps,
  );
  await createPromoCode(
    {
      actorId: 9,
      actorRole: "admin",
      code: "FIVEDAYS",
      accessDays: 5,
      maxUses: "",
      expiresAt: "",
      teacherRef: "",
    },
    deps,
  );
  const first = await redeemPromo({ userId: 5, code: "tendays" }, clock);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.accessUntil.toISOString(), "2026-06-11T12:00:00.000Z");
  assert.equal(first.teacherLinked, true);
  assert.equal(first.teacherName, "Марія Коваль");
  assert.deepEqual(links, [{ teacher_user_id: 2, student_user_id: 5 }]);

  const second = await redeemPromo({ userId: 5, code: "fivedays" }, clock);
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.accessUntil.toISOString(), "2026-06-16T12:00:00.000Z");
  assert.equal(second.teacherLinked, false);

  const repeat = await redeemPromo({ userId: 5, code: "TENDAYS" }, clock);
  assert.deepEqual(repeat, { ok: false, code: "already" });

  const access = await getStudentAccess(5, deps);
  assert.equal(access.accessUntil, "2026-06-16T12:00:00.000Z");
  assert.deepEqual(access.teachers, ["Марія Коваль"]);
});

test("inactive, expired, exhausted and non-student codes do not grant access", async () => {
  const { deps } = world();
  const clock = { ...deps, now: () => NOW };
  await createPromoCode(
    {
      actorId: 9,
      actorRole: "admin",
      code: "CLOSED",
      accessDays: 3,
      maxUses: "1",
      expiresAt: "2026-01-01T10:00",
      teacherRef: "",
    },
    deps,
  );
  assert.deepEqual(await redeemPromo({ userId: 4, code: "CLOSED" }, clock), {
    ok: false,
    code: "not_student",
  });
  assert.deepEqual(await redeemPromo({ userId: 5, code: "CLOSED" }, clock), {
    ok: false,
    code: "expired",
  });
  await setPromoActive({ actorId: 9, actorRole: "admin", promoId: 1, active: false }, deps);
  const fresh = await createPromoCode(
    {
      actorId: 2,
      actorRole: "teacher",
      code: "ONCE",
      accessDays: 2,
      maxUses: "1",
      expiresAt: "",
      teacherRef: "",
    },
    deps,
  );
  assert.equal(fresh.ok, true);
  assert.equal((await redeemPromo({ userId: 5, code: "ONCE" }, clock)).ok, true);
  assert.deepEqual(await redeemPromo({ userId: 6, code: "ONCE" }, clock), {
    ok: false,
    code: "exhausted",
  });
  await setPromoActive({ actorId: 2, actorRole: "teacher", promoId: 2, active: false }, deps);
  assert.deepEqual(await redeemPromo({ userId: 6, code: "once" }, clock), {
    ok: false,
    code: "inactive",
  });
  const foreign = await setPromoActive(
    { actorId: 3, actorRole: "teacher", promoId: 2, active: true },
    deps,
  );
  assert.deepEqual(foreign, { ok: false, code: "not_found" });
});

test("lists and teacher refs stay inside the caller's role", async () => {
  const { deps } = world();
  await createPromoCode(
    {
      actorId: 2,
      actorRole: "teacher",
      code: "MINE",
      accessDays: 4,
      maxUses: "",
      expiresAt: "",
      teacherRef: "",
    },
    deps,
  );
  await createPromoCode(
    {
      actorId: 9,
      actorRole: "admin",
      code: "THEIRS",
      accessDays: 4,
      maxUses: "",
      expiresAt: "",
      teacherRef: "ihor",
    },
    deps,
  );
  const own = await listPromoCodes({ actorId: 2, actorRole: "teacher" }, deps);
  assert.deepEqual(own.map((row) => row.code), ["MINE"]);
  const all = await listPromoCodes({ actorId: 9, actorRole: "admin" }, deps);
  assert.deepEqual(all.map((row) => row.code).sort(), ["MINE", "THEIRS"]);
  assert.equal((await resolveTeacherRef("ihor", deps))?.id, 3);
  assert.equal((await resolveTeacherRef("3", deps))?.displayName, "Ігор Петренко");
  assert.equal(await resolveTeacherRef("banned", deps), null);
  assert.equal(await resolveTeacherRef("8", deps), null);
  assert.equal(parseKyivDateTimeLocal(""), null);
  assert.equal(parseKyivDateTimeLocal("nope"), "invalid");
  const kyivMorning = parseKyivDateTimeLocal("2026-01-15T10:00");
  assert.ok(kyivMorning instanceof Date);
  assert.equal(kyivMorning.toISOString(), "2026-01-15T08:00:00.000Z");
});
