import { ContentImportError } from "./errors";
import type { ContentImportInput } from "./index";
import { MAX_TOTAL_UPLOAD_BYTES } from "./schema";

const JSON_FIELDS = new Set(["file", "format"]);
const CSV_FIELDS = new Set(["themes", "themeConnections", "quizTasks", "problems"]);

function totalSize(files: File[]): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}

function isFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as File).arrayBuffer === "function"
  );
}

function fieldNameCounts(formData: FormData): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of formData.keys()) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Parses multipart form fields into a validated import input, or throws `ContentImportError`. */
export function buildImportInputFromFormData(formData: FormData): ContentImportInput {
  const counts = fieldNameCounts(formData);
  const fieldNames = [...counts.keys()];

  const hasJsonField = fieldNames.some((f) => JSON_FIELDS.has(f));
  const hasCsvField = fieldNames.some((f) => CSV_FIELDS.has(f));

  if (hasJsonField && hasCsvField) {
    throw new ContentImportError("validation", [
      "Request mixes JSON and CSV fields; use exactly one import shape.",
    ]);
  }
  if (!hasJsonField && !hasCsvField) {
    throw new ContentImportError("unsupported_format", [
      'Request must include either a "file" field with format=json, or "themes"/"themeConnections"/"quizTasks" CSV file fields.',
    ]);
  }

  const allowedFields = hasJsonField ? JSON_FIELDS : CSV_FIELDS;
  const unknownFields = fieldNames.filter((f) => !allowedFields.has(f));
  if (unknownFields.length > 0) {
    throw new ContentImportError("validation", [
      `Unknown field(s) for this import shape: ${unknownFields.join(", ")}`,
    ]);
  }

  const duplicateFields = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([f]) => f);
  if (duplicateFields.length > 0) {
    throw new ContentImportError("validation", [
      `Duplicate form field(s): ${duplicateFields.join(", ")}`,
    ]);
  }

  if (hasJsonField) {
    const format = formData.get("format");
    if (format !== "json") {
      throw new ContentImportError("unsupported_format", [
        'JSON import requires a "format" field with value "json".',
      ]);
    }
    const fileField = formData.get("file");
    if (!isFile(fileField)) {
      throw new ContentImportError("validation", ['Field "file" must be an uploaded file.']);
    }
    if (totalSize([fileField]) > MAX_TOTAL_UPLOAD_BYTES) {
      throw new ContentImportError("payload_too_large", ["Uploaded file exceeds the size limit."]);
    }
    return { format: "json", file: fileField };
  }

  const themesField = formData.get("themes");
  const themeConnectionsField = formData.get("themeConnections");
  const quizTasksField = formData.get("quizTasks");
  const problemsField = formData.get("problems");
  const missing: string[] = [];
  if (!isFile(themesField)) missing.push("themes");
  if (!isFile(themeConnectionsField)) missing.push("themeConnections");
  if (!isFile(quizTasksField)) missing.push("quizTasks");
  if (problemsField != null && problemsField !== "" && !isFile(problemsField)) {
    missing.push("problems");
  }
  if (missing.length > 0) {
    throw new ContentImportError("validation", [
      `Missing or invalid CSV file field(s): ${missing.join(", ")}`,
    ]);
  }
  const files = [themesField, themeConnectionsField, quizTasksField].filter(
    isFile,
  );
  if (isFile(problemsField) && problemsField.size > 0) {
    files.push(problemsField);
  }
  if (totalSize(files) > MAX_TOTAL_UPLOAD_BYTES) {
    throw new ContentImportError("payload_too_large", ["Uploaded files exceed the size limit."]);
  }
  return {
    format: "csv",
    themes: themesField as File,
    themeConnections: themeConnectionsField as File,
    quizTasks: quizTasksField as File,
    ...(isFile(problemsField) && problemsField.size > 0
      ? { problems: problemsField }
      : {}),
  };
}
