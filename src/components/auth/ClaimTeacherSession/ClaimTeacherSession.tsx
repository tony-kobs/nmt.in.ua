"use client";

import { useEffect, useRef } from "react";
import { claimTeacherSessionAction } from "@/modules/payments/actions";

type ClaimTeacherSessionProps = {
  reference: string;
};

/** Sets the teacher session cookie after a successful paid signup. */
export function ClaimTeacherSession({ reference }: ClaimTeacherSessionProps) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void claimTeacherSessionAction(reference);
  }, [reference]);

  return null;
}
