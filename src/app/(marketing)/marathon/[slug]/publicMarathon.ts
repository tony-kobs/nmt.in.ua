import { cache } from "react";
import { getPublicDailyBySlug } from "@/modules/marathons/daily/store";

/** One public-row lookup per request, shared by the layout guard and the page. */
export const loadPublicMarathon = cache((slug: string) => getPublicDailyBySlug(slug));
