"use client";

import { useState } from "react";
import { KeyRound, PencilLine, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/shared/action-button";
import { resetPasswordAction } from "@/actions/org";
import type { EmployeeFormOptions, EmployeeRow } from "@/server/queries/performance";
import { EmployeeDialog, PasswordReveal } from "./employee-dialog";

export function AddEmployeeButton({ options }: { options: EmployeeFormOptions }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus /> إضافة موظف
      </Button>
      <EmployeeDialog open={open} onOpenChange={setOpen} employee={null} options={options} />
    </>
  );
}

export function EmployeeRowActions({
  employee,
  options,
  canEdit,
  canResetPassword,
}: {
  employee: EmployeeRow;
  options: EmployeeFormOptions;
  canEdit: boolean;
  canResetPassword: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  return (
    <div className="flex items-center justify-end gap-1">
      {canEdit && (
        <Button size="icon-sm" variant="ghost" aria-label="تعديل" title="تعديل" onClick={() => setOpen(true)}>
          <PencilLine />
        </Button>
      )}
      {canResetPassword && (
        <ActionButton
          size="icon-sm"
          variant="ghost"
          aria-label="إعادة تعيين كلمة المرور"
          title="إعادة تعيين كلمة المرور"
          action={resetPasswordAction.bind(null, employee.id)}
          confirm={{ title: `إعادة تعيين كلمة مرور ${employee.fullName}؟`, description: "سيتم توليد كلمة مرور جديدة وإنهاء جميع جلسات الموظف الحالية.", confirmLabel: "إعادة التعيين" }}
          refresh={false}
          onDone={(d) => {
            const pw = (d as { password?: string } | undefined)?.password;
            if (pw) setPassword(pw);
          }}
        >
          <KeyRound />
        </ActionButton>
      )}
      {canEdit && <EmployeeDialog open={open} onOpenChange={setOpen} employee={employee} options={options} />}
      <PasswordReveal password={password} title={`كلمة المرور الجديدة لـ ${employee.fullName}`} onClose={() => setPassword(null)} />
    </div>
  );
}
