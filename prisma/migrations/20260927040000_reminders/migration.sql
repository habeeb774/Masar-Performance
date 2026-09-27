-- «ملاحظات وتذكيرات»: standalone notes, not read by any plan / report / performance calculation
CREATE TYPE "ReminderPriority" AS ENUM ('NORMAL', 'IMPORTANT');
CREATE TYPE "ReminderStatus" AS ENUM ('OPEN', 'POSTPONED', 'APPROVED', 'CANCELLED');

CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "remindOn" DATE NOT NULL,
    "priority" "ReminderPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "ReminderStatus" NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT NOT NULL,
    "employeeId" TEXT,
    "adHocTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Reminder_adHocTaskId_key" ON "Reminder"("adHocTaskId");
CREATE INDEX "Reminder_ownerId_status_idx" ON "Reminder"("ownerId", "status");
CREATE INDEX "Reminder_employeeId_idx" ON "Reminder"("employeeId");
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_adHocTaskId_fkey" FOREIGN KEY ("adHocTaskId") REFERENCES "AdHocTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
