import "server-only";

import { redirect } from "next/navigation";
import { registerParentFromInvite, type RegisterParentResult } from "./registerParentFromInvite";

export type RegisterParentActionState =
  | { status: "idle" }
  | Extract<RegisterParentResult, { status: "error" }>;

type Deps = {
  register: typeof registerParentFromInvite;
  redirectTo: (path: string) => never;
};

/** Server-only form adapter; dependencies are never arguments of the public action. */
export async function handleParentRegistration(
  formData: FormData,
  deps: Deps = { register: registerParentFromInvite, redirectTo: redirect },
): Promise<RegisterParentActionState> {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  let result: RegisterParentResult;
  try {
    // Validation and the atomic account/link/token operation belong to the backend.
    result = await deps.register({
      token: text("token"), displayName: text("displayName"), email: text("email"),
      password: text("password"), passwordConfirm: text("passwordConfirm"),
    });
  } catch {
    return { status: "error", code: "serverError" };
  }
  if (result.status === "error") return { status: "error", code: result.code };

  const checkEmail = `/register/check-email?email=${encodeURIComponent(result.email)}&next=%2Fparent`;
  // Redirect throws in Next; keep it outside the backend error handler.
  // No session is opened: use the existing confirmation/resend flow.
  return deps.redirectTo(result.verificationSent ? checkEmail : `${checkEmail}&mail=failed`);
}
