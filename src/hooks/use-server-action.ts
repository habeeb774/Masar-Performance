"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/server/action";

/**
 * Run a server action with pending state + toast feedback.
 *   const { run, pending } = useServerAction(approvePlanAction);
 *   run(planId).then((r) => r.ok && close());
 */
export function useServerAction<A extends unknown[], T>(
  action: (...args: A) => Promise<ActionResult<T>>,
  opts: { successMessage?: string; silent?: boolean; onSuccess?: (data: T | undefined) => void } = {},
) {
  const [pending, start] = useTransition();
  const run = (...args: A) =>
    new Promise<ActionResult<T>>((resolve) => {
      start(async () => {
        try {
          const result = await action(...args);
          if (result.ok) {
            if (!opts.silent) toast.success(result.message ?? opts.successMessage ?? "تم الحفظ بنجاح");
            opts.onSuccess?.(result.data);
          } else {
            toast.error(result.error);
          }
          resolve(result);
        } catch (e) {
          // redirects thrown by actions are handled by Next.js
          if (e && typeof e === "object" && "digest" in e) throw e;
          toast.error("تعذر الاتصال بالخادم");
          resolve({ ok: false, error: "تعذر الاتصال بالخادم" });
        }
      });
    });
  return { run, pending };
}
