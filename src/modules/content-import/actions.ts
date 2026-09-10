"use server";

import { getCurrentUser } from "@/modules/auth/getCurrentUser";
import { buildImportInputFromFormData } from "./buildImportInputFromFormData";
import { isContentImportConfigured } from "./auth";
import { ContentImportError, runContentImport, type ImportSummary } from "./index";
import { logSanitizedError } from "./logging";

export type ContentImportActionState =
  | { status: "idle" }
  | { status: "unauthorized"; errors: string[] }
  | { status: "error"; errors: string[] }
  | {
      status: "success";
      inserted: ImportSummary["inserted"];
      updated: ImportSummary["updated"];
      totalInserted: number;
      totalUpdated: number;
    };

const UNAUTHORIZED_MESSAGE =
  "Імпорт недоступний: потрібен обліковий запис адміністратора та ключ CONTENT_IMPORT_API_KEY на сервері.";
const GENERIC_ERROR_MESSAGE = "Не вдалося виконати імпорт. Спробуйте пізніше.";

type ContentImportActionDeps = {
  runContentImport: typeof runContentImport;
  getCurrentUser: typeof getCurrentUser;
  isContentImportConfigured: typeof isContentImportConfigured;
};

/**
 * Server Action for the settings-page import UI. Uses `CONTENT_IMPORT_API_KEY`
 * only on the server — the client never sends or stores the secret.
 */
export async function contentImportAction(
  _prevState: ContentImportActionState,
  formData: FormData,
  deps: ContentImportActionDeps = {
    runContentImport,
    getCurrentUser,
    isContentImportConfigured,
  },
): Promise<ContentImportActionState> {
  if (!deps.isContentImportConfigured()) {
    return { status: "unauthorized", errors: [UNAUTHORIZED_MESSAGE] };
  }

  const user = await deps.getCurrentUser();
  if (!user || user.role !== "admin") {
    return { status: "unauthorized", errors: [UNAUTHORIZED_MESSAGE] };
  }

  try {
    const input = buildImportInputFromFormData(formData);
    const summary = await deps.runContentImport(input);
    const { invalidateCatalogCache } = await import("@/lib/cache/catalogCache");
    invalidateCatalogCache();
    return {
      status: "success",
      inserted: summary.inserted,
      updated: summary.updated,
      totalInserted: summary.totalInserted,
      totalUpdated: summary.totalUpdated,
    };
  } catch (error) {
    if (error instanceof ContentImportError) {
      return { status: "error", errors: error.errors };
    }
    logSanitizedError("content_import.action", error);
    return { status: "error", errors: [GENERIC_ERROR_MESSAGE] };
  }
}
