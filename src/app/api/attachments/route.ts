import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { getCurrentUser } from "@/server/auth/session";
import { rateLimit } from "@/server/rate-limit";
import { canAccessEmployee } from "@/lib/permissions";
import { idSchema } from "@/lib/validation";
import { entityEmployeeId, listAttachments } from "@/server/queries/tasks";
import { json, MAX_ATTACHMENT_BYTES, sameOrigin } from "./shared";

const entitySchema = z.enum(["DAILY_TASK", "AD_HOC_TASK", "WEEKLY_REPORT", "MONTHLY_REPORT", "MONTHLY_GOAL"]);

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/heic",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/csv",
  "application/zip",
  "application/x-zip-compressed",
]);

function safeFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "file";
  // strip control chars and characters that are problematic in headers / filesystems
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "").trim();
  return (cleaned || "file").slice(0, 200);
}

async function authorize(entityType: z.infer<typeof entitySchema>, entityId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: json({ error: "انتهت الجلسة، يرجى تسجيل الدخول مجددًا" }, 401) } as const;
  const employeeId = await entityEmployeeId(entityType, entityId);
  if (!employeeId) return { error: json({ error: "العنصر غير موجود" }, 404) } as const;
  if (!canAccessEmployee(user, employeeId)) return { error: json({ error: "لا يمكنك الوصول لهذا العنصر" }, 403) } as const;
  return { user } as const;
}

/** GET /api/attachments?entityType=&entityId= — list files (metadata only). */
export async function GET(req: NextRequest) {
  const parsed = z
    .object({ entityType: entitySchema, entityId: idSchema })
    .safeParse({ entityType: req.nextUrl.searchParams.get("entityType"), entityId: req.nextUrl.searchParams.get("entityId") });
  if (!parsed.success) return json({ error: "طلب غير صالح" }, 400);
  const auth = await authorize(parsed.data.entityType, parsed.data.entityId);
  if ("error" in auth) return auth.error;
  return json({ items: await listAttachments(parsed.data.entityType, parsed.data.entityId) });
}

/** POST multipart: entityType, entityId, file */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: "مصدر الطلب غير مسموح" }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ error: "انتهت الجلسة، يرجى تسجيل الدخول مجددًا" }, 401);

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_ATTACHMENT_BYTES + 64 * 1024) return json({ error: "حجم الملف يتجاوز 5 ميجابايت" }, 413);

  const limit = await rateLimit(`upload:${user.id}`, 30, 10 * 60 * 1000);
  if (!limit.ok) return json({ error: "محاولات رفع كثيرة، حاول لاحقًا" }, 429);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "تعذر قراءة الملف المرسل" }, 400);
  }
  const parsed = z
    .object({ entityType: entitySchema, entityId: idSchema })
    .safeParse({ entityType: form.get("entityType"), entityId: form.get("entityId") });
  if (!parsed.success) return json({ error: "بيانات العنصر غير صالحة" }, 400);
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "اختر ملفًا للرفع" }, 400);
  if (file.size === 0) return json({ error: "الملف فارغ" }, 400);
  if (file.size > MAX_ATTACHMENT_BYTES) return json({ error: "حجم الملف يتجاوز 5 ميجابايت" }, 413);
  const mimeType = (file.type || "").toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) return json({ error: "نوع الملف غير مسموح (صور، PDF، مستندات Office، نصوص، CSV، ZIP)" }, 415);

  const auth = await authorize(parsed.data.entityType, parsed.data.entityId);
  if ("error" in auth) return auth.error;

  const fileName = safeFileName(file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const created = await db.attachment.create({
    data: {
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      fileName,
      mimeType,
      size: bytes.byteLength,
      data: bytes,
      uploadedById: user.id,
    },
    select: { id: true, fileName: true, mimeType: true, size: true, uploadedById: true, createdAt: true },
  });
  await audit({
    user,
    action: "attachment.upload",
    entityType: "Attachment",
    entityId: created.id,
    after: { entityType: parsed.data.entityType, entityId: parsed.data.entityId, fileName, mimeType, size: created.size },
  });
  return json(
    {
      item: {
        id: created.id,
        fileName: created.fileName,
        mimeType: created.mimeType,
        size: created.size,
        uploadedById: created.uploadedById,
        uploaderName: user.employeeName ?? user.name,
        createdAt: created.createdAt.toISOString(),
      },
    },
    201,
  );
}
