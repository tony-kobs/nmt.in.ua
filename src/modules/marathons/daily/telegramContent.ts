import { parseMathText } from "@/components/ui/MathText/parseMathText";
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

function segmentsOf(source: string): Segment[] {
  const segments: Segment[] = [];
  for (const part of parseMathText(source)) {
    if (part.type === "formula") {
      if (part.content.trim()) {
        segments.push({ kind: "formula", tex: part.content.trim(), display: part.displayMode });
      }
      continue;
    }
    let cursor = 0;
    for (const match of part.content.matchAll(IMAGE)) {
      const index = match.index ?? 0;
      const before = part.content.slice(cursor, index);
      if (before.trim()) segments.push({ kind: "text", value: before });
      const url = match[1] || match[2] || match[0];
      if (url) segments.push({ kind: "image", url: url.replace(/[),.;]+$/, "") });
      cursor = index + match[0].length;
    }
    const after = part.content.slice(cursor);
    if (after.trim()) segments.push({ kind: "text", value: after });
  }
  return segments;
}

function withButtons(pieces: DeliveryPiece[], source: RichSource): DeliveryPiece[] {
  if (pieces.length === 0) pieces.push({ text: source.text.trim() || " " });
  const buttons = [...(source.buttons ?? [])];
  if (source.siteUrl && source.siteLabel) {
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
        siteUrl: source.siteUrl,
        siteLabel: source.siteLabel,
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

export function expandSources(sources: RichSource[]): DeliveryPiece[] {
  const pieces: DeliveryPiece[] = [];
  for (const source of sources) {
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
    piece.text.trim().length > 0 ||
    piece.photoUrl ||
    piece.photoUrls ||
    piece.videoUrl ||
    piece.videoFileId ||
    piece.formulaTex ||
    (piece.buttons && piece.buttons.length > 0),
  );
}

export type PreviewBubble = {
  kind: "text" | "video" | "photo" | "formula" | "task";
  body: string;
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
    sources.push({
      text: [task.prompt, ...task.options.map((option, index) => `${index + 1}. ${option}`)].join("\n"),
      rich: true,
      buttons: task.options.map((option, index) => ({
        text: optionLabel(option, index),
      })),
      siteLabel: input.siteLabel,
      siteUrl: "https://nmt.in.ua",
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
    body: piece.formulaTex
      ? piece.formulaTex
      : piece.previewUrl || piece.videoUrl || piece.videoFileId || piece.photoUrl || piece.photoUrls?.join("\n") || piece.text,
    buttons: (piece.buttons ?? []).map((button) => button.text),
  }));
}

export function optionLabel(option: string, index: number): string {
  const plain = option
    .replace(/\$\$[\s\S]+?\$\$/g, "")
    .replace(/\$[^$\n]+\$/g, "")
    .replace(/\\\([\s\S]+?\\\)/g, "")
    .replace(/\\\[[\s\S]+?\\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const label = plain ? `${index + 1}. ${plain}` : String(index + 1);
  return label.slice(0, 64);
}

export function introSources(videoUrl: string, rules: string): RichSource[] {
  const sources: RichSource[] = [];
  const video = videoUrl.trim();
  if (video) {
    const classified = classifyVideo(video);
    if (classified && "videoUrl" in classified) sources.push({ text: video, videoUrl: classified.videoUrl });
    else if (classified && "videoFileId" in classified) sources.push({ text: "", videoFileId: classified.videoFileId });
    else if (classified && "previewUrl" in classified) sources.push({ text: video, previewUrl: classified.previewUrl });
    else sources.push({ text: video, rich: true });
  }
  if (rules.trim()) sources.push({ text: rules.trim(), rich: true });
  return sources;
}
