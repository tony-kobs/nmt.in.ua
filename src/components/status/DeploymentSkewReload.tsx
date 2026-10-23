"use client";

import { useEffect } from "react";
import { attemptSkewReload } from "@/lib/deploymentSkew";

/** Chunk and action failures that never reach an error boundary. */
export function DeploymentSkewReload() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      attemptSkewReload(event.error ?? event.message);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      attemptSkewReload(event.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
