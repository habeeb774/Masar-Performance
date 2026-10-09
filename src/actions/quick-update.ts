"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/action";
import { actionUser } from "@/server/auth/session";
import { idSchema } from "@/lib/validation";
import * as quick from "@/server/services/quick-update";

export type { QuickUpdatePreview } from "@/server/services/quick-update";

const kindSchema = z.enum(["add", "set", "complete"]);

/** «أضفت 5 منتجات جديدة» → what the system understood, before anything is saved. */
export async function interpretQuickUpdateAction(text: string) {
  return runAction(async () => {
    const user = await actionUser();
    return quick.previewQuickUpdate(user, z.string().trim().min(2, "اكتب ما أنجزته").max(300).parse(text));
  });
}

/** Save what was understood. */
export async function applyQuickUpdateAction(taskId: string, kind: "add" | "set" | "complete", amount: number | null) {
  return runAction(async () => {
    const user = await actionUser();
    await quick.applyQuickUpdate(user, idSchema.parse(taskId), kindSchema.parse(kind), amount === null ? null : z.number().min(-100_000).max(1_000_000).parse(amount));
    revalidatePath("/", "layout");
  }, "تم تسجيل الإنجاز");
}
