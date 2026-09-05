import type { AbstractIntlMessages } from "next-intl";

/**
 * Namespaces read by `"use client"` components via `useTranslations`.
 * Server components keep using `getTranslations` against the full catalog.
 */
export const CLIENT_MESSAGE_NAMESPACES = [
  "Header",
  "Sidebar",
  "Dashboard",
  "LanguageSwitcher",
  "RecentResults",
  "TopicTestStart",
  "RecommendedActions",
  "MentorAssign",
  "TopicTrainer",
  "TopicTrainerSummary",
  "LearningSessionsTable",
  "LoginForm",
  "RegisterForm",
  "ContentImportForm",
  "simulator",
  "nmtTrainer",
  "Feedback",
] as const;

export function pickClientMessages(
  messages: AbstractIntlMessages,
): AbstractIntlMessages {
  const picked: AbstractIntlMessages = {};
  for (const key of CLIENT_MESSAGE_NAMESPACES) {
    const value = messages[key];
    if (value !== undefined) {
      picked[key] = value;
    }
  }
  return picked;
}
