"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, UserError } from "@/server/action";
import { actionUser, assertEmployeeAccess } from "@/server/auth/session";
import { db } from "@/server/db";
import { idSchema } from "@/lib/validation";
import { entityEmployeeId, listComments, type CommentRow } from "@/server/queries/tasks";

const entitySchema = z.enum([
  "MONTHLY_PLAN",
  "MONTHLY_GOAL",
  "DAILY_TASK",
  "AD_HOC_TASK",
  "WEEKLY_REPORT",
  "MONTHLY_REPORT",
  "PERFORMANCE_REVIEW",
]);
type CommentEntityKey = z.infer<typeof entitySchema>;

const bodySchema = z.string().trim().min(1, "اكتب التعليق").max(2000, "التعليق طويل جدًا (2000 حرف كحد أقصى)");

async function authorize(entityType: CommentEntityKey, entityId: string) {
  const user = await actionUser();
  const employeeId = await entityEmployeeId(entityType, entityId);
  if (!employeeId) throw new UserError("العنصر غير موجود أو تم حذفه");
  assertEmployeeAccess(user, employeeId);
  return user;
}

export async function listCommentsAction(entityType: CommentEntityKey, entityId: string) {
  return runAction<CommentRow[]>(async () => {
    const type = entitySchema.parse(entityType);
    const id = idSchema.parse(entityId);
    await authorize(type, id);
    return listComments(type, id);
  });
}

export async function addCommentAction(entityType: CommentEntityKey, entityId: string, body: string) {
  return runAction<CommentRow>(async () => {
    const type = entitySchema.parse(entityType);
    const id = idSchema.parse(entityId);
    const text = bodySchema.parse(body);
    const user = await authorize(type, id);
    const c = await db.comment.create({ data: { entityType: type, entityId: id, authorId: user.id, body: text } });
    revalidatePath("/", "layout");
    return { id: c.id, body: c.body, authorId: user.id, authorName: user.employeeName ?? user.name, createdAt: c.createdAt.toISOString() };
  }, "تمت إضافة التعليق");
}

export async function deleteCommentAction(commentId: string) {
  return runAction(async () => {
    const user = await actionUser();
    const c = await db.comment.findUnique({ where: { id: idSchema.parse(commentId) } });
    if (!c) throw new UserError("التعليق غير موجود أو تم حذفه");
    if (c.authorId !== user.id) throw new UserError("يمكن حذف التعليق بواسطة كاتبه فقط");
    await db.comment.delete({ where: { id: c.id } });
    revalidatePath("/", "layout");
  }, "تم حذف التعليق");
}
