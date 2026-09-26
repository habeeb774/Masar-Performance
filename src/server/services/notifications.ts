import "server-only";
import type { NotificationChannel, NotificationType } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { PERMISSIONS } from "@/lib/permissions";

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  /** identical keys are delivered once (idempotent cron reminders) */
  dedupeKey?: string;
}

/**
 * Delivery channel abstraction. IN_APP is persisted; EMAIL / WHATSAPP / SLACK
 * can be added later by registering a sender without touching callers.
 */
export interface ChannelSender {
  channel: NotificationChannel;
  send(userId: string, payload: NotificationPayload): Promise<void>;
}

const extraSenders: ChannelSender[] = [];

export function registerChannel(sender: ChannelSender) {
  if (!extraSenders.some((s) => s.channel === sender.channel)) extraSenders.push(sender);
}

export async function notifyUsers(userIds: string[], payload: NotificationPayload) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return;
  await db.notification.createMany({
    data: unique.map((userId) => ({
      userId,
      type: payload.type,
      channel: "IN_APP" as const,
      title: payload.title.slice(0, 300),
      body: payload.body?.slice(0, 2000) ?? null,
      link: payload.link ?? null,
      dedupeKey: payload.dedupeKey ? `${payload.dedupeKey}:${userId}` : null,
      sentAt: new Date(),
    })),
    skipDuplicates: true,
  });
  for (const sender of extraSenders) {
    for (const userId of unique) {
      try {
        await sender.send(userId, payload);
      } catch (e) {
        console.error(`[notify:${sender.channel}]`, e);
      }
    }
  }
}

export async function notifyEmployee(employeeId: string, payload: NotificationPayload) {
  const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { userId: true } });
  if (emp) await notifyUsers([emp.userId], payload);
}

/** Direct manager + everyone holding a review permission. */
export async function managerUserIdsFor(employeeId: string): Promise<string[]> {
  const emp = await db.employee.findUnique({
    where: { id: employeeId },
    select: { manager: { select: { userId: true } } },
  });
  const reviewers = await db.user.findMany({
    where: {
      status: "ACTIVE",
      role: {
        permissions: {
          some: { permission: { key: { in: [PERMISSIONS.PLANS_APPROVE, PERMISSIONS.REPORTS_REVIEW] } } },
        },
      },
    },
    select: { id: true },
  });
  return [...new Set([emp?.manager?.userId, ...reviewers.map((r) => r.id)].filter((x): x is string => !!x))];
}

export async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}
