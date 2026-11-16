import "server-only";

import { clearAttributionCookies, readAttributionCookies } from "./cookies";
import {
  linkStudentToTeacher,
  previewPromo,
  redeemPromo,
  resolveTeacherRef,
  type RedeemCode,
} from "./store";
import { attributionFromSearch, mergeAttribution } from "./values";

export type AttributionResult = {
  promo: RedeemCode | "applied" | "absent";
  teacher: "linked" | "known" | "missing" | "absent";
};

type AttributionDeps = {
  readCookies?: typeof readAttributionCookies;
  clearCookies?: typeof clearAttributionCookies;
  redeem?: typeof redeemPromo;
  resolveTeacher?: typeof resolveTeacherRef;
  linkTeacher?: typeof linkStudentToTeacher;
  /** Form fields win over the cookie when the visitor still has the query. */
  promo?: string | null;
  ref?: string | null;
};

export type SignupAttributionPreview = {
  promo: string | null;
  promoStatus: "absent" | "usable" | "unusable" | "unknown";
  promoDays: number | null;
  ref: string | null;
  teacherName: string | null;
};

/**
 * Applies the 30-day `?promo=` / `?ref=` cookies after a student account exists.
 * A failure here must not block registration or login: the account field remains.
 */
export async function applySignupAttribution(
  userId: number,
  deps: AttributionDeps = {},
): Promise<AttributionResult> {
  const read = deps.readCookies ?? readAttributionCookies;
  const clear = deps.clearCookies ?? clearAttributionCookies;
  const saved = await read();
  const promo = deps.promo !== undefined ? deps.promo : saved.promo;
  const ref = deps.ref !== undefined ? deps.ref : saved.ref;
  const result: AttributionResult = { promo: "absent", teacher: "absent" };
  if (!promo && !ref) return result;

  let keepCookies = false;
  if (promo) {
    const redeemed = await (deps.redeem ?? redeemPromo)({
      userId,
      code: promo,
    });
    result.promo = redeemed.ok ? "applied" : redeemed.code;
    if (!redeemed.ok && redeemed.code === "server") keepCookies = true;
  }

  if (ref) {
    const teacher = await (deps.resolveTeacher ?? resolveTeacherRef)(ref);
    if (!teacher) {
      result.teacher = "missing";
    } else {
      const linked = await (deps.linkTeacher ?? linkStudentToTeacher)(
        userId,
        teacher.id,
      );
      result.teacher = linked ? "linked" : "known";
    }
  }

  if (!keepCookies) await clear();
  return result;
}

/** Banner on the sign-up card. The open link wins over an older cookie. */
export async function describeSignupAttribution(query: {
  promo?: string | null;
  ref?: string | null;
}): Promise<SignupAttributionPreview | null> {
  const params = new URLSearchParams();
  if (query.promo) params.set("promo", query.promo);
  if (query.ref) params.set("ref", query.ref);
  let fromCookie = { promo: null as string | null, ref: null as string | null };
  try {
    fromCookie = await readAttributionCookies();
  } catch (error) {
    console.error("describeSignupAttribution: cookie read failed", error);
  }
  const merged = mergeAttribution(attributionFromSearch(params), fromCookie);
  if (!merged.promo && !merged.ref) return null;

  let promoStatus: SignupAttributionPreview["promoStatus"] = "absent";
  let promoDays: number | null = null;
  if (merged.promo) {
    try {
      const preview = await previewPromo(merged.promo);
      if (!preview || !preview.usable) {
        promoStatus = "unusable";
      } else {
        promoStatus = "usable";
        promoDays = preview.accessDays;
      }
    } catch (error) {
      console.error("describeSignupAttribution: promo preview failed", error);
      promoStatus = "unknown";
    }
  }

  let teacherName: string | null = null;
  if (merged.ref) {
    try {
      teacherName = (await resolveTeacherRef(merged.ref))?.displayName ?? null;
    } catch (error) {
      console.error("describeSignupAttribution: teacher lookup failed", error);
    }
  }

  return {
    promo: merged.promo,
    promoStatus,
    promoDays,
    ref: merged.ref,
    teacherName,
  };
}
