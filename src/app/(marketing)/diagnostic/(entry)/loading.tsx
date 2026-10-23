import { DiagnosticIntro } from "@/components/diagnostic/DiagnosticIntro";
import { DiagnosticShell } from "@/components/diagnostic/DiagnosticShell";

/** Same frame as the entry page, so the click from the welcome page does not
 * pass through the marketing loading scene first. */
export default function DiagnosticEntryLoading() {
  return (
    <DiagnosticShell mathDecor="intro">
      <DiagnosticIntro contentAvailable />
    </DiagnosticShell>
  );
}
