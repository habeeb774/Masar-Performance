"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerAction } from "@/hooks/use-server-action";
import { createPlanAction, suggestPlanPeriodAction } from "@/actions/plans";
import { AR_MONTH_NAMES, executionEndDate, formatDateAr, isDateKey } from "@/lib/dates";

export interface PlanEmployeeOption {
  id: string;
  fullName: string;
  jobTitleId: string | null;
  jobTitleName: string | null;
}

export interface PlanTemplateOption {
  id: string;
  name: string;
  jobTitleId: string | null;
  isActive: boolean;
  itemCount: number;
}

const NONE = "__none";
const BLANK = "__blank";

function suggestedTemplate(templates: PlanTemplateOption[], employee: PlanEmployeeOption | undefined) {
  if (!employee?.jobTitleId) return undefined;
  return templates.find((t) => t.isActive && t.jobTitleId === employee.jobTitleId);
}

/** Create a monthly plan for an employee, optionally from a goal template. */
export function CreatePlanDialog({
  employees,
  templates,
  year,
  month,
  employeeId,
  label = "إنشاء خطة",
  size = "default",
  variant = "default",
}: {
  employees: PlanEmployeeOption[];
  templates: PlanTemplateOption[];
  year: number;
  month: number;
  /** preselected employee */
  employeeId?: string;
  label?: string;
  size?: "default" | "sm";
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [emp, setEmp] = useState<string | undefined>(employeeId);
  const [y, setY] = useState(String(year));
  const [m, setM] = useState(String(month));
  const [executionStart, setExecutionStart] = useState("");
  const [weeksCount, setWeeksCount] = useState(4);
  const validCount = Number.isInteger(weeksCount) && weeksCount >= 1 && weeksCount <= 52;
  const suggest = useServerAction(suggestPlanPeriodAction, { onSuccess: (data) => { if (data) setExecutionStart(data.start); } });
  const [tpl, setTpl] = useState<string>(() => (suggestedTemplate(templates, employees.find((e) => e.id === employeeId)) ? NONE : BLANK));
  const { run, pending } = useServerAction(createPlanAction, {
    onSuccess: (d) => {
      setOpen(false);
      if (d?.id) router.push(`/monthly-plans/${d.id}`);
      else router.refresh();
    },
  });

  const employee = employees.find((e) => e.id === emp);
  const suggestion = suggestedTemplate(templates, employee);
  const pickEmployee = (id: string) => {
    setEmp(id);
    setExecutionStart("");
    setTpl(suggestedTemplate(templates, employees.find((e) => e.id === id)) ? NONE : BLANK);
  };
  // job-title templates first, then the rest
  const sorted = [...templates].sort((a, b) => Number(b.jobTitleId === employee?.jobTitleId) - Number(a.jobTitleId === employee?.jobTitleId) || Number(b.isActive) - Number(a.isActive));

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        <Plus /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>إنشاء خطة شهرية</DialogTitle>
            <DialogDescription>تُنسخ أهداف القالب المختار إلى الخطة ويمكن تعديلها قبل الاعتماد.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>الموظف</Label>
              <Select value={emp} onValueChange={pickEmployee}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر الموظف" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.fullName}
                      {e.jobTitleName && <span className="text-muted-foreground"> — {e.jobTitleName}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>الشهر</Label>
                <Select value={m} onValueChange={setM}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AR_MONTH_NAMES.map((name, i) => (
                      <SelectItem key={i} value={String(i + 1)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-year">السنة</Label>
                <Input id="plan-year" type="number" min={2020} max={2100} value={y} onChange={(e) => setY(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>قالب الأهداف</Label>
              <Select value={tpl} onValueChange={setTpl}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {suggestion ? (
                    <>
                      <SelectItem value={NONE}>تلقائي — قالب المسمى الوظيفي النشط</SelectItem>
                      <SelectItem value={BLANK}>بدون قالب (خطة فارغة)</SelectItem>
                    </>
                  ) : (
                    <SelectItem value={BLANK}>بدون قالب (خطة فارغة)</SelectItem>
                  )}
                  {sorted.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.itemCount} بند){!t.isActive && " — غير نشط"}
                      {t.id === suggestion?.id && " ★"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {suggestion && <p className="text-xs text-muted-foreground">القالب المقترح لمسمى الموظف: {suggestion.name}</p>}
              {employee && !employee.jobTitleId && <p className="text-xs text-warning">الموظف بدون مسمى وظيفي — اختر قالبًا يدويًا أو أنشئ خطة فارغة.</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="new-execution-start">بداية فترة التنفيذ</Label><Input id="new-execution-start" type="date" value={executionStart} onChange={(event) => setExecutionStart(event.target.value)} /><p className="text-xs text-muted-foreground">اتركه فارغًا لبدء الخطة بعد نهاية الخطة السابقة.</p></div>
              <div className="space-y-2"><Label htmlFor="new-weeks-count">عدد الأسابيع</Label><Input id="new-weeks-count" type="number" min={1} max={52} value={weeksCount} onChange={(event) => setWeeksCount(Number(event.target.value))} /></div>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={!emp || !validCount || suggest.pending} onClick={() => emp && suggest.run(emp, Number(y), Number(m), weeksCount)}>اقتراح بداية التنفيذ</Button>
            <p className="text-sm text-muted-foreground">نهاية فترة التنفيذ: {isDateKey(executionStart) && validCount ? formatDateAr(executionEndDate(executionStart, weeksCount)) : "تُحسب تلقائيًا عند اختيار البداية"}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              إلغاء
            </Button>
            <Button
              disabled={pending || !emp || !validCount}
              onClick={() =>
                emp &&
                run({
                  employeeId: emp,
                  year: Number(y),
                  month: Number(m),
                  templateId: tpl === NONE || tpl === BLANK ? null : tpl,
                  useTemplate: tpl !== BLANK,
                  executionStartDate: executionStart || null,
                  weeksCount,
                })
              }
            >

              {pending && <Spinner />} إنشاء الخطة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
