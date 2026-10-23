"use client";

import { useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { attemptSkewReload } from "@/lib/deploymentSkew";
import { StatusScene } from "@/components/status/StatusScene";
import {
  readStatusLocaleFromCookie,
  statusCopy,
} from "@/i18n/statusPages";

type AppError = Error & { digest?: string };

function subscribeNever() {
  return () => {};
}

function readClientLocale() {
  return readStatusLocaleFromCookie(document.cookie);
}

function readServerLocale() {
  return "uk";
}

export function StatusErrorView({
  error,
  reset,
  layout = "page",
}: {
  error: AppError;
  reset: () => void;
  layout?: "page" | "embed";
}) {
  const locale = useSyncExternalStore(
    subscribeNever,
    readClientLocale,
    readServerLocale,
  );

  useLayoutEffect(() => {
    attemptSkewReload(error);
  }, [error]);

  useEffect(() => {
    console.error(error);
  }, [error]);

  const copy = useMemo(() => statusCopy(locale), [locale]);

  return (
    <StatusScene
      variant="error"
      copy={copy}
      layout={layout}
      reset={reset}
      digest={error.digest}
    />
  );
}
