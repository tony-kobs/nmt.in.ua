"use client";

import { useFormStatus } from "react-dom";
import { askConfirm } from "@/components/ui/ConfirmDialog/ConfirmDialog";

type ConfirmSubmitProps = {
  message: string;
  pendingLabel: string;
  className?: string;
  children: React.ReactNode;
};

export function ConfirmSubmit({
  message,
  pendingLabel,
  className,
  children,
}: ConfirmSubmitProps) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={(event) => {
        if (pending) {
          event.preventDefault();
          return;
        }
        const button = event.currentTarget;
        const form = button.form;
        if (button.dataset.confirmed === "1") {
          delete button.dataset.confirmed;
          return;
        }
        event.preventDefault();
        void askConfirm(message).then((ok) => {
          if (!ok || !form) return;
          button.dataset.confirmed = "1";
          form.requestSubmit(button);
        });
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export function SubmitButton({
  className,
  pendingLabel,
  children,
}: {
  className?: string;
  pendingLabel: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-busy={pending || undefined}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
