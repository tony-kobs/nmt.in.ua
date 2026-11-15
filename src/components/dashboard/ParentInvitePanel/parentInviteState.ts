import type { AuthUser } from "@/modules/auth/types";
import type { CreateParentInviteResult } from "@/modules/parent-students/createParentInvite";

export function canShowParentInvites(user: Pick<AuthUser, "role" | "realRole">): boolean {
  return (user.role === "student" || user.role === "teacher") && (user.realRole ?? user.role) === user.role;
}

export type ParentInviteState = {
  studentId: string;
  pending: boolean;
  result: CreateParentInviteResult | null;
  copy: "idle" | "copied" | "failed";
};
export const INITIAL_PARENT_INVITE: ParentInviteState = { studentId: "", pending: false, result: null, copy: "idle" };
type Event =
  | { type: "select"; studentId: string }
  | { type: "start" }
  | { type: "result"; studentId: string; result: CreateParentInviteResult }
  | { type: "copy"; url: string; status: "copied" | "failed" };

export function parentInviteReducer(state: ParentInviteState, event: Event): ParentInviteState {
  switch (event.type) {
    case "select": return { ...INITIAL_PARENT_INVITE, studentId: event.studentId };
    case "start": return { ...state, pending: true, result: null, copy: "idle" };
    case "result": return state.studentId === event.studentId
      ? { ...state, pending: false, result: event.result, copy: "idle" } : state;
    case "copy": return state.result?.status === "success" && state.result.url === event.url
      ? { ...state, copy: event.status } : state;
  }
}
