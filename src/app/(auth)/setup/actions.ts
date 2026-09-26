"use server";

import { redirect } from "next/navigation";
import type { z } from "zod";
import { runAction, UserError } from "@/server/action";
import { setupSchema } from "@/lib/validation";
import { completeSetup, isSetupCompleted } from "@/server/services/setup";

export async function completeSetupAction(input: z.input<typeof setupSchema>) {
  const result = await runAction(async () => {
    if (await isSetupCompleted()) throw new UserError("تم إعداد النظام مسبقًا");
    await completeSetup(setupSchema.parse(input));
  }, "تم إنشاء الحساب بنجاح");
  if (result.ok) redirect("/login?next=%2Fdashboard&setup=1");
  return result;
}
