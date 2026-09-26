import type { NextRequest } from "next/server";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { getCurrentUser } from "@/server/auth/session";
import { canAccessEmployee, hasPermission, PERMISSIONS } from "@/lib/permissions";
import { idSchema } from "@/lib/validation";
import { entityEmployeeId } from "@/server/queries/tasks";
import { json, sameOrigin } from "../shared";

type Ctx = { params: Promise<{ id: string }> };

/** RFC 5987 / 6266 Content-Disposition with an ASCII fallback for old clients. */
function contentDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "file";
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

async function load(req: NextRequest, ctx: Ctx, withData: boolean) {
  const user = await getCurrentUser();
  if (!user) return { error: json({ error: "انتهت الجلسة، يرجى تسجيل الدخول مجددًا" }, 401) } as const;
  const parsed = idSchema.safeParse((await ctx.params).id);
  if (!parsed.success) return { error: json({ error: "طلب غير صالح" }, 400) } as const;
  const attachment = await db.attachment.findUnique({
    where: { id: parsed.data },
    select: { id: true, entityType: true, entityId: true, fileName: true, mimeType: true, size: true, uploadedById: true, data: withData },
  });
  if (!attachment) return { error: json({ error: "الملف غير موجود" }, 404) } as const;
  const employeeId = await entityEmployeeId(attachment.entityType, attachment.entityId);
  // orphaned attachments (entity deleted) are only visible to their uploader
  const allowed = employeeId ? canAccessEmployee(user, employeeId) : attachment.uploadedById === user.id;
  if (!allowed) return { error: json({ error: "لا يمكنك الوصول لهذا الملف" }, 403) } as const;
  return { user, attachment } as const;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const res = await load(req, ctx, true);
  if ("error" in res) return res.error;
  const { attachment } = res;
  const data = attachment.data as Uint8Array;
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": attachment.mimeType || "application/octet-stream",
      "Content-Length": String(data.byteLength),
      "Content-Disposition": contentDisposition(attachment.fileName),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  if (!sameOrigin(req)) return json({ error: "مصدر الطلب غير مسموح" }, 403);
  const res = await load(req, ctx, false);
  if ("error" in res) return res.error;
  const { user, attachment } = res;
  if (attachment.uploadedById !== user.id && !hasPermission(user, PERMISSIONS.TASKS_ASSIGN)) {
    return json({ error: "يحذف الملف رافعه أو المدير فقط" }, 403);
  }
  await db.attachment.delete({ where: { id: attachment.id } });
  await audit({
    user,
    action: "attachment.delete",
    entityType: "Attachment",
    entityId: attachment.id,
    before: { entityType: attachment.entityType, entityId: attachment.entityId, fileName: attachment.fileName, mimeType: attachment.mimeType, size: attachment.size },
  });
  return json({ ok: true });
}
