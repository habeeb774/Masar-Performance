import "server-only";
import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { AuthError } from "@/server/auth/session";
import { UserError } from "@/server/user-error";
export { UserError } from "@/server/user-error";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };


/**
 * Wrap a server action body: turns validation, authorization and known DB
 * errors into a serializable result instead of leaking stack traces.
 */
export async function runAction<T>(fn: () => Promise<T>, successMessage?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message: successMessage };
  } catch (e) {
    // let Next.js control-flow errors (redirect / notFound) propagate
    if (e && typeof e === "object" && "digest" in e && typeof (e as { digest: unknown }).digest === "string") {
      const digest = (e as { digest: string }).digest;
      if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")) throw e;
    }
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of e.issues) {
        const key = issue.path.join(".") || "_";
        (fieldErrors[key] ??= []).push(issue.message);
      }
      return { ok: false, error: e.issues[0]?.message ?? "البيانات المدخلة غير صحيحة", fieldErrors };
    }
    if (e instanceof AuthError || e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return { ok: false, error: "يوجد سجل بنفس البيانات مسبقًا" };
      if (e.code === "P2025") return { ok: false, error: "السجل غير موجود أو تم حذفه" };
      if (e.code === "P2003") return { ok: false, error: "لا يمكن تنفيذ العملية لوجود بيانات مرتبطة" };
    }
    console.error("[action]", e);
    return { ok: false, error: "حدث خطأ غير متوقع، حاول مرة أخرى" };
  }
}
