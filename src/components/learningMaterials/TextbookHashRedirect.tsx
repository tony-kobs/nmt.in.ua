"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { textbookTopicHref } from "@/content/learningMaterials/textbookHref";

/**
 * Old links used `/materials/textbook#topic-CODE`. Redirect once to `?topic=`
 * so the server only loads that section.
 */
export function TextbookHashRedirect() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#topic-")) return;
    const code = decodeURIComponent(hash.slice("#topic-".length)).trim();
    if (!code) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("topic") === code) {
      history.replaceState(null, "", textbookTopicHref(code));
      return;
    }

    router.replace(textbookTopicHref(code));
  }, [router]);

  return null;
}
