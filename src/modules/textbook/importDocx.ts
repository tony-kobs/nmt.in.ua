import "server-only";

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import mammoth from "mammoth";
import { htmlToTextbookMarkup, materializeImportImages, type ImportDraft } from "./importHtml";
import { replaceWordMath } from "./omml";

export const DOCX_MAX_BYTES = 8 * 1024 * 1024;

export type DocxImport =
  | { ok: true; draft: ImportDraft }
  | { ok: false; error: "read" | "size" };

/**
 * `.docx` becomes textbook markup.
 * mammoth turns the package into HTML (headings, lists, tables, pictures).
 * Word equations are OMML, which mammoth drops, so they are rewritten to
 * LaTeX first. MathML from a Docs/Word paste is handled in `htmlToTextbookMarkup`
 * by mathml-to-latex. Pictures go through the same `textbook_images` dedupe
 * as the toolbar upload.
 */
export async function importDocx(
  bytes: Uint8Array,
  save: (file: Uint8Array) => Promise<{ ok: true; src: string } | { ok: false }>,
): Promise<DocxImport> {
  if (bytes.byteLength === 0 || bytes.byteLength > DOCX_MAX_BYTES) return { ok: false, error: "size" };
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    return { ok: false, error: "read" };
  }
  const documentXml = files["word/document.xml"];
  if (!documentXml) return { ok: false, error: "read" };
  files["word/document.xml"] = strToU8(replaceWordMath(strFromU8(documentXml)));
  let html = "";
  try {
    const result = await mammoth.convertToHtml(
      { buffer: Buffer.from(zipSync(files)) },
      { convertImage: mammoth.images.dataUri },
    );
    html = result.value;
  } catch {
    return { ok: false, error: "read" };
  }
  const draft = await materializeImportImages(htmlToTextbookMarkup(html), save);
  return { ok: true, draft };
}
