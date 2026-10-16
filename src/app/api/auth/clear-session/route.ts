import { NextResponse } from "next/server";

import { absoluteSiteUrl } from "@/lib/siteOrigin";
import {
  clearSessionCookie,
  revokeCurrentLoginSession,
} from "@/modules/auth/getCurrentUser";

/**
 * Clears `nmt_session` then sends the browser to `/login`.
 * Cookie writes are not allowed during Server Component render (App layout),
 * so banned / missing accounts redirect here instead of calling
 * `clearSessionCookie` inline.
 *
 * Absolute Location must use SITE_URL — `request.url` is the internal
 * 127.1.10.37 listener behind the hosting proxy.
 */
export async function GET() {
  try {
    await revokeCurrentLoginSession();
  } catch (error) {
    console.error("clear-session: revoke failed", error);
  }
  await clearSessionCookie();
  return NextResponse.redirect(absoluteSiteUrl("/login"));
}
