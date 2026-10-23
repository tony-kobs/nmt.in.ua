"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DiagnosticSessionRunner } from "@/components/diagnostic/DiagnosticSessionRunner";
import { SessionExpiredNotice } from "@/components/testing/SessionExpiredNotice";
import {
  loadDiagnosticBoardAction,
  type DiagnosticBoard,
} from "@/modules/diagnostic/actions";
import css from "./DiagnosticIntro.module.css";

type DiagnosticInlineBoardProps = {
  sessionId: number;
  isGuest: boolean;
};

/** The attempt itself, rendered in the intro's card slot. */
export function DiagnosticInlineBoard({
  sessionId,
  isGuest,
}: DiagnosticInlineBoardProps) {
  const t = useTranslations("Diagnostic");
  const [board, setBoard] = useState<DiagnosticBoard | null>(null);
  const [error, setError] = useState<"generic" | "sessionExpired" | null>(null);

  const reload = useCallback(async () => {
    const result = await loadDiagnosticBoardAction(sessionId);
    if (result.status !== "success") {
      setError(result.code === "sessionExpired" ? "sessionExpired" : "generic");
      return false;
    }
    setBoard(result.board);
    setError(null);
    return true;
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    void loadDiagnosticBoardAction(sessionId).then((result) => {
      if (cancelled) return;
      if (result.status !== "success") {
        setError(result.code === "sessionExpired" ? "sessionExpired" : "generic");
        return;
      }
      setBoard(result.board);
      setError(null);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (error === "sessionExpired") return <SessionExpiredNotice />;

  if (error) {
    return (
      <div className={css.placeholder}>
        <p role="alert">{t("errors.generic")}</p>
      </div>
    );
  }

  if (!board) {
    return (
      <div className={css.placeholder} aria-busy="true">
        <span className={css.placeholderIcon} aria-hidden="true">
          ∑
        </span>
        <p>{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className={css.board}>
      <DiagnosticSessionRunner
        sessionId={sessionId}
        themeCode={board.themeCode}
        themeName={board.themeName}
        tasks={board.tasks}
        isGuest={isGuest}
        initialIndex={board.initialIndex}
        progressTotal={board.progressTotal}
        continueAfterLast={board.continueAfterLast}
        onReload={reload}
        embed
      />
    </div>
  );
}
