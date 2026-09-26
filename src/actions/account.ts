"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action";
import { actionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { audit } from "@/server/audit";

/** Sign the current user out of every device except the one making the request. */
export async function revokeOtherSessionsAction() {
  return runAction(async () => {
    const user = await actionUser();
    const { count } = await db.session.deleteMany({ where: { userId: user.id, id: { not: user.sessionId } } });
    await audit({ user, action: "auth.logout", entityType: "User", entityId: user.id, after: { revokedSessions: count }, reason: "revoke other sessions" });
    revalidatePath("/account");
    return { count };
  }, "تم تسجيل الخروج من الأجهزة الأخرى");
}
