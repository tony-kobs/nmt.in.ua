const PREFIX =
  /^\[(Персональна|Personal|Persönlich)\s·\s([^\]]+)\]\s*([\s\S]*)$/u;

export type PersonalConsultationNote = {
  teacherName: string;
  message: string;
};

/** The stored prefix is for the teacher inbox. The student sees a label and the text. */
export function splitPersonalConsultationNote(
  note: string,
): PersonalConsultationNote | null {
  const match = PREFIX.exec(note.trim());
  if (!match) return null;
  const teacherName = match[2]?.trim() ?? "";
  if (!teacherName) return null;
  return {
    teacherName,
    message: (match[3] ?? "").trim(),
  };
}
