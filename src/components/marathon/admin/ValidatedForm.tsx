"use client";

import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type InputHTMLAttributes,
} from "react";
import { useTranslations } from "next-intl";
import {
  IDLE_ADMIN_FORM,
  type AdminFormState,
  type FieldIssue,
} from "@/modules/marathons/daily/forms";
import { useHideSaved } from "./AdminNotices";
import css from "../marathon.module.css";

type IssueContextValue = {
  formId: string;
  message: (field: string) => string | null;
  issues: FieldIssue[];
  attempt: number;
};

const IssueContext = createContext<IssueContextValue>({
  formId: "",
  message: () => null,
  issues: [],
  attempt: 0,
});

export type NestedFormError = { count: number; attempt: number };

const NestedErrorContext = createContext<((formId: string, error: NestedFormError) => void) | null>(
  null,
);

const SnapshotContext = createContext<(name: string, value: string) => void>(() => {});

export function useFormIssues(): { issues: FieldIssue[]; attempt: number } {
  const { issues, attempt } = useContext(IssueContext);
  return { issues, attempt };
}

export function NestedErrorProvider({
  report,
  children,
}: {
  report: (formId: string, error: NestedFormError) => void;
  children: ReactNode;
}) {
  return <NestedErrorContext.Provider value={report}>{children}</NestedErrorContext.Provider>;
}

export function SnapshotProvider({
  onChange,
  children,
}: {
  onChange: (name: string, value: string) => void;
  children: ReactNode;
}) {
  return <SnapshotContext.Provider value={onChange}>{children}</SnapshotContext.Provider>;
}

function errorId(formId: string, name: string): string {
  return `${formId}-${name}-error`;
}

function controlId(formId: string, name: string): string {
  return `${formId}-${name}`;
}

export function AdminField({
  name,
  label,
  hint,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const { formId, message } = useContext(IssueContext);
  const text = message(name);
  return (
    <div className={css.field}>
      <label className={css.fieldLabel} htmlFor={controlId(formId, name)}>
        {label}
      </label>
      {hint ? <p className={css.hint}>{hint}</p> : null}
      {children}
      {text ? (
        <p id={errorId(formId, name)} className={css.fieldError}>
          {text}
        </p>
      ) : null}
    </div>
  );
}

export function FieldError({ name }: { name: string }) {
  const { formId, message } = useContext(IssueContext);
  const text = message(name);
  if (!text) return null;
  return (
    <p id={errorId(formId, name)} className={css.fieldError}>
      {text}
    </p>
  );
}

export function useFieldDescribedBy(name: string): string | undefined {
  const { formId, message } = useContext(IssueContext);
  return message(name) ? errorId(formId, name) : undefined;
}

function useControl(name: string) {
  const { formId, message } = useContext(IssueContext);
  const text = message(name);
  return {
    id: controlId(formId, name),
    name,
    form: formId || undefined,
    "aria-invalid": text ? true : undefined,
    "aria-describedby": text ? errorId(formId, name) : undefined,
  };
}

function usePublishChange<T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
  name: string,
  onChange?: (event: ChangeEvent<T>) => void,
) {
  const publish = useContext(SnapshotContext);
  return (event: ChangeEvent<T>) => {
    publish(name, event.currentTarget.value);
    onChange?.(event);
  };
}

export function AdminCheck({ name, label }: { name: string; label: string }) {
  const control = useControl(name);
  return (
    <label className={css.check} htmlFor={control.id}>
      <input type="checkbox" value="1" {...control} />
      <span>{label}</span>
    </label>
  );
}

export function AdminInput({
  name,
  onChange,
  ...props
}: { name: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "id">) {
  const control = useControl(name);
  const publishChange = usePublishChange<HTMLInputElement>(name, onChange);
  return <input className={css.input} {...props} {...control} onChange={publishChange} />;
}

export function AdminTextarea({
  name,
  onChange,
  ...props
}: { name: string } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "name" | "id">) {
  const control = useControl(name);
  const publishChange = usePublishChange<HTMLTextAreaElement>(name, onChange);
  return <textarea className={css.textarea} {...props} {...control} onChange={publishChange} />;
}

export function AdminSelect({
  name,
  onChange,
  children,
  ...props
}: { name: string } & Omit<SelectHTMLAttributes<HTMLSelectElement>, "name" | "id">) {
  const control = useControl(name);
  const publishChange = usePublishChange<HTMLSelectElement>(name, onChange);
  return (
    <select className={css.select} {...props} {...control} onChange={publishChange}>
      {children}
    </select>
  );
}

type ValidatedFormProps = {
  action: (prev: AdminFormState, formData: FormData) => Promise<AdminFormState>;
  validate: (formData: FormData) => { ok: true } | { ok: false; issues: FieldIssue[] };
  className?: string;
  quiet?: boolean;
  submitLabel: string;
  children: ReactNode;
  /** Keep the summary alert, but move focus to the first invalid section instead. */
  invalidFocus?: "summary" | "section";
  /**
   * Render the form element separately so other forms (status) can sit in the same section.
   * Fields associate with it through the form attribute.
   */
  associate?: boolean;
  persist?: ReactNode;
};

export function ValidatedForm({
  action,
  validate,
  className,
  quiet,
  submitLabel,
  children,
  invalidFocus = "summary",
  associate = false,
  persist,
}: ValidatedFormProps) {
  const t = useTranslations("Marathon");
  const hideSaved = useHideSaved();
  const formId = `mf-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const summaryRef = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const [state, formAction, pending] = useActionState(action, IDLE_ADMIN_FORM);
  const [clientIssues, setClientIssues] = useState<FieldIssue[] | null>(null);
  const [hiddenState, setHiddenState] = useState<AdminFormState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [trackedState, setTrackedState] = useState(state);
  const reportNested = useContext(NestedErrorContext);
  const serverIssues =
    state.status === "error" && state !== hiddenState ? state.issues : [];
  const issues = clientIssues ?? serverIssues;
  const issueKey = issues.map((issue) => `${issue.field}:${issue.code}`).join("|");
  if (state !== trackedState) {
    setTrackedState(state);
    if (state.status === "error") setAttempt((value) => value + 1);
  }

  useEffect(() => {
    if (!pending) lock.current = false;
  }, [pending]);

  useEffect(() => {
    if (!issueKey || invalidFocus === "section") return;
    summaryRef.current?.focus();
  }, [issueKey, invalidFocus]);

  useEffect(() => {
    if (!reportNested) return;
    reportNested(formId, { count: issues.length, attempt });
    return () => reportNested(formId, { count: 0, attempt: 0 });
  }, [reportNested, formId, issues.length, attempt]);

  function textOf(issue: FieldIssue): string {
    return t(`fieldErrors.${issue.field}.${issue.code}`);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    hideSaved();
    if (pending || lock.current) {
      event.preventDefault();
      return;
    }
    const parsed = validate(new FormData(event.currentTarget));
    if (!parsed.ok) {
      event.preventDefault();
      setClientIssues(parsed.issues);
      setAttempt((value) => value + 1);
      return;
    }
    lock.current = true;
    setClientIssues(null);
    setHiddenState(state);
  }

  const value: IssueContextValue = {
    formId,
    issues,
    attempt,
    message: (field) => {
      const found = issues.find((item) => item.field === field);
      return found ? textOf(found) : null;
    },
  };

  const summary =
    issues.length > 0 ? (
      <div ref={summaryRef} tabIndex={-1} className={css.alertError} role="alert">
        <p>{t("formSummary")}</p>
        <ul>
          {issues.map((item) => (
            <li key={`${item.field}:${item.code}`}>{textOf(item)}</li>
          ))}
        </ul>
      </div>
    ) : null;

  const submit = (
    <button
      type="submit"
      form={formId}
      className={quiet ? css.buttonQuiet : css.button}
      disabled={pending}
      aria-busy={pending || undefined}
    >
      {pending ? t("saving") : submitLabel}
    </button>
  );

  if (associate) {
    return (
      <IssueContext.Provider value={value}>
        <form
          id={formId}
          action={formAction}
          className={css.associateForm}
          onSubmit={onSubmit}
          noValidate
        >
          {persist}
        </form>
        <div className={className}>
          {summary}
          {children}
          {submit}
        </div>
      </IssueContext.Provider>
    );
  }

  return (
    <form id={formId} action={formAction} className={className} onSubmit={onSubmit} noValidate>
      <IssueContext.Provider value={value}>
        {summary}
        {children}
        {submit}
      </IssueContext.Provider>
    </form>
  );
}
