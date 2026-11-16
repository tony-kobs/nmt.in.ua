import "server-only";

import { cookies } from "next/headers";
import {
  ATTRIBUTION_MAX_AGE_SEC,
  PROMO_COOKIE,
  REF_COOKIE,
  normalizePromoCode,
  normalizeTeacherRef,
} from "./values";

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function readAttributionCookies(): Promise<{
  promo: string | null;
  ref: string | null;
}> {
  const jar = await cookies();
  return {
    promo: normalizePromoCode(jar.get(PROMO_COOKIE)?.value),
    ref: normalizeTeacherRef(jar.get(REF_COOKIE)?.value),
  };
}

export async function clearAttributionCookies(): Promise<void> {
  const jar = await cookies();
  jar.set(PROMO_COOKIE, "", cookieOptions(0));
  jar.set(REF_COOKIE, "", cookieOptions(0));
}

export { ATTRIBUTION_MAX_AGE_SEC, cookieOptions };
