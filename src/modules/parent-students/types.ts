export type ParentChild = { id: number; displayName: string };

export type ParentAccessErrorCode = "unauthorized" | "forbidden" | "not_found";

/** Safe domain error; the page/route decides whether to redirect or return 403/404. */
export class ParentAccessError extends Error {
  constructor(public readonly code: ParentAccessErrorCode) {
    super(code === "not_found" ? "Child unavailable" : "Parent access denied");
    this.name = "ParentAccessError";
  }
}
