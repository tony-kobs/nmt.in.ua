"use client";

import { StatusErrorView } from "@/components/status/StatusErrorView";

export default function MarketingErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <StatusErrorView error={error} reset={reset} layout="page" />;
}
