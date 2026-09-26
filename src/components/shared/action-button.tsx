"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { useServerAction } from "@/hooks/use-server-action";
import type { ActionResult } from "@/server/action";

type ButtonProps = React.ComponentProps<typeof Button>;

/**
 * Button that invokes a server action, optionally behind a confirmation
 * dialog, optionally collecting a reason/comment.
 */
export function ActionButton<T>({
  action,
  children,
  confirm,
  reason,
  successMessage,
  refresh = true,
  onDone,
  ...props
}: Omit<ButtonProps, "onClick" | "action"> & {
  action: (reason?: string) => Promise<ActionResult<T>>;
  confirm?: { title: string; description?: string; confirmLabel?: string; destructive?: boolean };
  reason?: { label: string; required?: boolean; placeholder?: string };
  successMessage?: string;
  refresh?: boolean;
  onDone?: (data: T | undefined) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const { run, pending } = useServerAction(action, {
    successMessage,
    onSuccess: (d) => {
      setOpen(false);
      setText("");
      if (refresh) router.refresh();
      onDone?.(d);
    },
  });

  if (!confirm && !reason) {
    return (
      <Button {...props} disabled={pending || props.disabled} onClick={() => run()}>
        {pending && <Spinner />}
        {children}
      </Button>
    );
  }
  return (
    <>
      <Button {...props} disabled={pending || props.disabled} onClick={() => setOpen(true)}>
        {pending && <Spinner />}
        {children}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title ?? reason?.label}</AlertDialogTitle>
            {confirm?.description && <AlertDialogDescription>{confirm.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          {reason && (
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={reason.placeholder ?? reason.label}
              rows={3}
              maxLength={2000}
              autoFocus
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending || (reason?.required && text.trim().length < 3)}
              className={confirm?.destructive ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
              onClick={(e) => {
                e.preventDefault();
                run(text.trim() || undefined);
              }}
            >
              {pending && <Spinner />}
              {confirm?.confirmLabel ?? "تأكيد"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
