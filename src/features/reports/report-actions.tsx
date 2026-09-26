"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Eye, RefreshCw, Save, Send, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { ActionButton } from "@/components/shared/action-button";
import { useServerAction } from "@/hooks/use-server-action";
import {
  refreshMonthlyReportAction,
  refreshWeeklyReportAction,
  reviewMonthlyReportAction,
  reviewWeeklyReportAction,
  saveMonthlyNotesAction,
  saveWeeklyNotesAction,
  submitMonthlyReportAction,
  submitWeeklyReportAction,
} from "@/actions/reports";

type Kind = "weekly" | "monthly";
type Decision = "APPROVE" | "RETURN" | "REVIEWED";

const saveNotes = (kind: Kind, id: string, values: Record<string, string>) =>
  kind === "weekly" ? saveWeeklyNotesAction(id, values) : saveMonthlyNotesAction(id, values);
const review = (kind: Kind, id: string, input: { decision: Decision; comment: string | null }) =>
  kind === "weekly" ? reviewWeeklyReportAction(id, input) : reviewMonthlyReportAction(id, input);

interface NoteField {
  key: string;
  label: string;
  placeholder?: string;
  value: string | null;
}

/** Owner panel (DRAFT / RETURNED): notes, refresh numbers, submit to manager. */
export function ReportOwnerPanel({ kind, reportId, notes, returned }: { kind: Kind; reportId: string; notes: NoteField[]; returned: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(notes.map((n) => [n.key, n.value ?? ""])));
  const [dirty, setDirty] = useState(false);
  const save = useServerAction((id: string, v: Record<string, string>) => saveNotes(kind, id, v), {
    onSuccess: () => {
      setDirty(false);
      router.refresh();
    },
  });

  const onSave = () => save.run(reportId, values);

  return (
    <Card className="no-print border-primary/30">
      <CardHeader>
        <CardTitle className="text-base">ملاحظاتي على التقرير</CardTitle>
        <CardDescription>
          {returned
            ? "أعاد المدير التقرير — راجع ملاحظته وعدّل ثم أعد الإرسال."
            : "أُعدّ هذا التقرير تلقائيًا من بيانات النظام. راجعه، أضف ملاحظة إن أردت، ثم أرسله. الأرقام تُحدَّث تلقائيًا قبل الإرسال."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {notes.map((n) => (
            <div key={n.key} className="space-y-1.5">
              <Label htmlFor={`note-${n.key}`}>{n.label}</Label>
              <Textarea
                id={`note-${n.key}`}
                rows={4}
                maxLength={5000}
                placeholder={n.placeholder}
                value={values[n.key] ?? ""}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [n.key]: e.target.value }));
                  setDirty(true);
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onSave} disabled={save.pending || !dirty} variant="outline">
            {save.pending ? <Spinner /> : <Save />} حفظ الملاحظات
          </Button>
          <ActionButton
            variant="ghost"
            action={() => (kind === "weekly" ? refreshWeeklyReportAction(reportId) : refreshMonthlyReportAction(reportId))}
            title="يعيد حساب الأرقام من بيانات النظام مع الإبقاء على ملاحظاتك"
          >
            <RefreshCw /> إعادة التوليد
          </ActionButton>
          <ActionButton
            action={async () => {
              if (dirty) {
                const r = await saveNotes(kind, reportId, values);
                if (!r.ok) return r;
              }
              return kind === "weekly" ? submitWeeklyReportAction(reportId) : submitMonthlyReportAction(reportId);
            }}
            confirm={{
              title: "إرسال التقرير للمدير؟",
              description: "ستُحدَّث الأرقام وتُحفظ ملاحظاتك، ولن تتمكن من التعديل بعد الإرسال إلا إذا أعاده المدير.",
              confirmLabel: "إرسال",
            }}
            onDone={() => setDirty(false)}
          >
            <Send /> إرسال للمدير
          </ActionButton>
          {dirty && <span className="text-xs text-warning">توجد تعديلات غير محفوظة</span>}
        </div>
      </CardContent>
    </Card>
  );
}

/** Reviewer panel (SUBMITTED / REVIEWED): approve, mark reviewed, or return with a reason. */
export function ReportReviewPanel({ kind, reportId, existingComment }: { kind: Kind; reportId: string; existingComment: string | null }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const { run, pending } = useServerAction((id: string, input: { decision: Decision; comment: string | null }) => review(kind, id, input), {
    onSuccess: () => {
      setComment("");
      router.refresh();
    },
  });
  const decide = (d: Decision) => {
    setDecision(d);
    void run(reportId, {
      decision: d,
      comment: comment.trim() || null,
    }).finally(() => setDecision(null));
  };
  const returnInvalid = comment.trim().length < 3;
  return (
    <Card className="no-print border-pending/40">
      <CardHeader>
        <CardTitle className="text-base">مراجعة التقرير</CardTitle>
        <CardDescription>
          اعتمد التقرير، أو علّمه كـ &quot;تمت المراجعة&quot; مع تعليق، أو أعده للموظف مع ذكر السبب.
          {existingComment && " التعليق الجديد يستبدل التعليق السابق."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="review-comment">{kind === "weekly" ? "تعليق المدير" : "ملاحظات المدير"}</Label>
          <Textarea
            id="review-comment"
            rows={3}
            maxLength={5000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="اكتب تعليقك أو سبب الإعادة…"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => decide("APPROVE")} disabled={pending} className="bg-success text-white hover:bg-success/90">
            {pending && decision === "APPROVE" ? <Spinner /> : <CheckCheck />} اعتماد
          </Button>
          <Button variant="outline" onClick={() => decide("REVIEWED")} disabled={pending}>
            {pending && decision === "REVIEWED" ? <Spinner /> : <Eye />} تمت المراجعة
          </Button>
          <Button
            variant="destructive"
            onClick={() => decide("RETURN")}
            disabled={pending || returnInvalid}
            title={returnInvalid ? "اكتب سبب الإعادة أولًا" : undefined}
          >
            {pending && decision === "RETURN" ? <Spinner /> : <Undo2 />} إعادة للموظف
          </Button>
        </div>
        {returnInvalid && <p className="text-[11px] text-muted-foreground">الإعادة تتطلب كتابة السبب في خانة التعليق.</p>}
      </CardContent>
    </Card>
  );
}

/** Monthly reviewer: manager notes editable independently of the review decision. */
export function ManagerNotesEditor({ reportId, value }: { reportId: string; value: string | null }) {
  const router = useRouter();
  const [text, setText] = useState(value ?? "");
  const { run, pending } = useServerAction(saveMonthlyNotesAction, {
    onSuccess: () => router.refresh(),
  });
  const dirty = text !== (value ?? "");
  return (
    <Card className="no-print">
      <CardHeader>
        <CardTitle className="text-base">ملاحظات المدير على الشهر</CardTitle>
        <CardDescription>تظهر للموظف في التقرير وتدعم التقييم الشهري.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea rows={4} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} />
        <Button variant="outline" onClick={() => run(reportId, { managerNotes: text })} disabled={pending || !dirty}>
          {pending ? <Spinner /> : <Save />} حفظ ملاحظات المدير
        </Button>
      </CardContent>
    </Card>
  );
}
