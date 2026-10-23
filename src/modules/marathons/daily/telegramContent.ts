import { parseMathText } from "@/components/ui/MathText/parseMathText";
import { formulaToPlain, latexToTelegramPlain } from "@/modules/telegram/latexPlain";
import { composeTelegramTask } from "@/modules/telegram/taskRender";
import {
  markdownToTelegramHtml,
  splitTelegramHtml,
} from "@/modules/telegram/telegramHtml";
import { loomEmbedSrc, youtubeEmbedSrc } from "./richText";

export type ContentButton = { text: string; data?: string; url?: string };

export type RichSource = {
  text: string;
  rich?: boolean;
  buttons?: ContentButton[];
  previewUrl?: string;
  videoUrl?: string;
  videoFileId?: string;
  photoUrl?: string;
  siteUrl?: string;
  siteLabel?: string;
  /** Keep the site URL for a failed picture, but do not show the button yet. */
  siteOnFail?: boolean;
  formulaTex?: string;
  formulaDisplay?: boolean;
};

export type DeliveryPiece = {
  text: string;
  html?: boolean;
  buttons?: ContentButton[];
  previewUrl?: string;
  videoUrl?: string;
  videoFileId?: string;
  photoUrl?: string;
  photoUrls?: string[];
  formulaTex?: string;
  formulaDisplay?: boolean;
  siteUrl?: string;
  siteLabel?: string;
  siteOnFail?: boolean;
};

const IMAGE = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)|<img\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["'][^>]*>|https?:\/\/\S+\.(?:png|jpe?g|gif|webp)(?:\?\S*)?/gi;

const FILE_ID = /^[A-Za-z0-9_-]{30,}$/;

export function classifyVideo(raw: string): { previewUrl: string } | { videoUrl: string } | { videoFileId: string } | null {
  const value = raw.trim();
  if (!value) return null;
  if (/\.mp4(?:$|\?)/i.test(value) && /^https?:\/\//i.test(value)) return { videoUrl: value };
  if (youtubeEmbedSrc(value) || loomEmbedSrc(value)) return { previewUrl: value };
  if (FILE_ID.test(value)) return { videoFileId: value };
  return null;
}

export function materialSources(material: { type: string; urlOrBody: string }): RichSource[] {
  const body = material.urlOrBody.trim();
  if (!body) return [];
  const video = material.type === "text" ? classifyVideo(body) : classifyVideo(body);
  if (video && ("videoUrl" in video || "videoFileId" in video || material.type !== "text")) {
    if ("videoUrl" in video) return [{ text: body, videoUrl: video.videoUrl }];
    if ("videoFileId" in video) return [{ text: "", videoFileId: video.videoFileId }];
    return [{ text: body, previewUrl: video.previewUrl }];
  }
  if (video && "previewUrl" in video && body === video.previewUrl) {
    return [{ text: body, previewUrl: video.previewUrl }];
  }
  return [{ text: body, rich: true }];
}

type Segment = { kind: "text"; value: string } | { kind: "image"; url: string } | { kind: "formula"; tex: string; display: boolean };

function pushText(segments: Segment[], value: string) {
  if (!value.trim()) return;
  const last = segments[segments.length - 1];
  if (last?.kind === "text") last.value += value;
  else segments.push({ kind: "text", value });
}

function segmentsOf(source: string): Segment[] {
  const segments: Segment[] = [];
  for (const part of parseMathText(source)) {
    if (part.type === "formula") {
      const tex = part.content.trim();
      if (!tex) continue;
      const plain = formulaToPlain(tex);
      if (plain) pushText(segments, plain);
      else segments.push({ kind: "formula", tex, display: part.displayMode });
      continue;
    }
    let cursor = 0;
    for (const match of part.content.matchAll(IMAGE)) {
      const index = match.index ?? 0;
      const before = part.content.slice(cursor, index);
      if (before.trim()) pushText(segments, before);
      const url = match[1] || match[2] || match[0];
      if (url) segments.push({ kind: "image", url: url.replace(/[),.;]+$/, "") });
      cursor = index + match[0].length;
    }
    const after = part.content.slice(cursor);
    if (after.trim()) pushText(segments, after);
  }
  return segments;
}

function withButtons(pieces: DeliveryPiece[], source: RichSource): DeliveryPiece[] {
  if (pieces.length === 0) pieces.push({ text: source.text.trim() || " " });
  const buttons = [...(source.buttons ?? [])];
  if (source.siteUrl && source.siteLabel && !source.siteOnFail) {
    buttons.push({ text: source.siteLabel.slice(0, 64), url: source.siteUrl });
  }
  const last = pieces[pieces.length - 1]!;
  if (buttons.length > 0) last.buttons = buttons;
  if (source.siteUrl) last.siteUrl = source.siteUrl;
  if (source.siteLabel) last.siteLabel = source.siteLabel;
  return pieces;
}

function expandRich(source: RichSource): DeliveryPiece[] {
  const segments = segmentsOf(source.text);
  const pieces: DeliveryPiece[] = [];
  let images: string[] = [];
  const flushImages = () => {
    if (images.length === 0) return;
    if (images.length === 1) pieces.push({ text: "", photoUrl: images[0] });
    else pieces.push({ text: "", photoUrls: images });
    images = [];
  };
  for (const segment of segments) {
    if (segment.kind === "image") {
      images.push(segment.url);
      continue;
    }
    flushImages();
    if (segment.kind === "formula") {
      pieces.push({
        text: "",
        formulaTex: segment.tex,
        formulaDisplay: segment.display,
      });
      continue;
    }
    const html = markdownToTelegramHtml(segment.value);
    for (const chunk of splitTelegramHtml(html)) {
      pieces.push({ text: chunk, html: true });
    }
  }
  flushImages();
  return withButtons(pieces, source);
}

function isNoise(piece: DeliveryPiece): boolean {
  if (
    piece.photoUrl ||
    piece.photoUrls?.length ||
    piece.videoUrl ||
    piece.videoFileId ||
    piece.formulaTex ||
    piece.previewUrl ||
    (piece.buttons && piece.buttons.length > 0)
  ) {
    return false;
  }
  const text = piece.text.replace(/<[^>]+>/g, "").trim();
  if (!text) return true;
  if (/^[.·…,;:!?]+$/.test(text)) return true;
  return /^[АБВГДЕЄ]\.$/.test(text);
}

export function expandSources(sources: RichSource[]): DeliveryPiece[] {
  const pieces: DeliveryPiece[] = [];
  for (const source of sources) {
    if (source.formulaTex) {
      pieces.push(...withButtons([{
        text: source.text.trim(),
        formulaTex: source.formulaTex,
        formulaDisplay: source.formulaDisplay !== false,
      }], source));
      continue;
    }
    if (source.videoUrl) {
      pieces.push(...withButtons([{ text: source.text.trim(), videoUrl: source.videoUrl }], source));
      continue;
    }
    if (source.videoFileId) {
      pieces.push(...withButtons([{ text: source.text.trim(), videoFileId: source.videoFileId }], source));
      continue;
    }
    if (source.previewUrl && !source.rich) {
      pieces.push(...withButtons([{ text: source.text.trim() || source.previewUrl, previewUrl: source.previewUrl }], source));
      continue;
    }
    if (source.photoUrl && !source.rich) {
      pieces.push(...withButtons([{ text: source.text.trim(), photoUrl: source.photoUrl }], source));
      continue;
    }
    if (!source.rich) {
      const text = source.text.trim();
      if (!text && !(source.buttons && source.buttons.length > 0)) continue;
      pieces.push(...withButtons([{ text }], source));
      continue;
    }
    pieces.push(...expandRich(source));
  }
  return pieces.filter((piece) =>
    !isNoise(piece) && (
      piece.text.trim().length > 0 ||
      piece.photoUrl ||
      piece.photoUrls ||
      piece.videoUrl ||
      piece.videoFileId ||
      piece.formulaTex ||
      (piece.buttons && piece.buttons.length > 0)
    ),
  );
}

export type PreviewBubble = {
  kind: "text" | "video" | "photo" | "formula" | "task";
  body: string;
  formula?: string;
  buttons: string[];
};

export function previewChat(input: {
  introText?: string | null;
  materials: Array<{ type: string; urlOrBody: string }>;
  tasks: Array<{ prompt: string; options: string[] }>;
  siteLabel: string;
}): PreviewBubble[] {
  const sources: RichSource[] = [];
  if (input.introText?.trim()) sources.push({ text: input.introText.trim(), rich: true });
  for (const material of input.materials) sources.push(...materialSources(material));
  for (const task of input.tasks) {
    const composed = composeTelegramTask({
      prompt: task.prompt,
      options: task.options,
      siteUrl: "https://nmt.in.ua",
      siteLabel: input.siteLabel,
    });
    sources.push({
      text: composed.text,
      ...(composed.buttons ? { buttons: composed.buttons } : {}),
      ...(composed.photoUrl ? { photoUrl: composed.photoUrl } : {}),
      ...(composed.formulaTex ? { formulaTex: composed.formulaTex, formulaDisplay: true } : {}),
      ...(composed.siteUrl ? { siteUrl: composed.siteUrl, siteLabel: composed.siteLabel } : {}),
      ...(composed.siteOnFail ? { siteOnFail: true } : {}),
    });
  }
  return expandSources(sources).map((piece) => ({
    kind: piece.formulaTex
      ? "formula"
      : piece.videoUrl || piece.videoFileId || piece.previewUrl
        ? "video"
        : piece.photoUrl || piece.photoUrls
          ? "photo"
          : piece.buttons && piece.buttons.length > 0
            ? "task"
            : "text",
    body: piece.text.trim()
      || piece.formulaTex
      || piece.previewUrl
      || piece.videoUrl
      || piece.videoFileId
      || piece.photoUrl
      || piece.photoUrls?.join("\n")
      || "",
    ...(piece.formulaTex ? { formula: piece.formulaTex } : {}),
    buttons: (piece.buttons ?? []).map((button) => button.text),
  }));
}

export function optionLabel(option: string, index: number): string {
  const plain = latexToTelegramPlain(option).replace(/\s+/g, " ").trim();
  const label = plain ? `${index + 1}. ${plain}` : String(index + 1);
  return label.slice(0, 64);
}

export function introSources(videoUrl: string, rules: string, photoUrl = ""): RichSource[] {
  const sources: RichSource[] = [];
  const photo = photoUrl.trim();
  const rulesText = rules.trim();
  const video = videoUrl.trim();
  const captionFits = rulesText.length > 0 && rulesText.length <= 1024 && !/[*_`[\]<>]/.test(rulesText);
  if (photo && captionFits && !video) {
    sources.push({ text: rulesText, photoUrl: photo });
    return sources;
  }
  if (photo) sources.push({ text: "", photoUrl: photo });
  if (video) {
    const classified = classifyVideo(video);
    if (classified && "videoUrl" in classified) sources.push({ text: video, videoUrl: classified.videoUrl });
    else if (classified && "videoFileId" in classified) sources.push({ text: "", videoFileId: classified.videoFileId });
    else if (classified && "previewUrl" in classified) sources.push({ text: video, previewUrl: classified.previewUrl });
    else sources.push({ text: video, rich: true });
  }
  if (rulesText) sources.push({ text: rulesText, rich: true });
  return sources;
}
