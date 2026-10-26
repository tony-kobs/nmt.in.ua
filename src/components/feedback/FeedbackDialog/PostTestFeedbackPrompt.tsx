"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  appendFeedbackPrompt,
  FEEDBACK_PROMPTED_KEY,
  wasFeedbackPrompted,
} from "@/modules/feedback/promptLog";

const FeedbackDialog = dynamic(
  () => import("./FeedbackDialog").then((mod) => mod.FeedbackDialog),
  { ssr: false },
);

type PostTestFeedbackPromptProps = {
  sessionId: number;
  isGuest?: boolean;
};

function readRaw(): string | null {
  try {
    return sessionStorage.getItem(FEEDBACK_PROMPTED_KEY);
  } catch {
    return null;
  }
}

function writeRaw(value: string) {
  try {
    sessionStorage.setItem(FEEDBACK_PROMPTED_KEY, value);
  } catch {
    // Private mode — still show this visit, then in-memory `open` handles dismiss.
  }
}

export function PostTestFeedbackPrompt({
  sessionId,
  isGuest = false,
}: PostTestFeedbackPromptProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!Number.isInteger(sessionId) || sessionId <= 0) return;
    const raw = readRaw();
    if (wasFeedbackPrompted(raw, sessionId)) return;
    writeRaw(appendFeedbackPrompt(raw, sessionId, Date.now()));

    // Opening in a follow-up task keeps hydration free of a cascading render.
    const timer = window.setTimeout(() => setOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, [sessionId]);

  const close = useCallback(() => setOpen(false), []);

  if (!open) return null;

  return (
    <FeedbackDialog
      open={open}
      onClose={close}
      source="post_test"
      sessionId={sessionId}
      isGuest={isGuest}
    />
  );
}
