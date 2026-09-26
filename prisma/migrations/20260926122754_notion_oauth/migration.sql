-- CreateEnum
CREATE TYPE "NotionAuthType" AS ENUM ('INTERNAL', 'OAUTH');

-- AlterTable
ALTER TABLE "NotionConnection" ADD COLUMN     "authType" "NotionAuthType" NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN     "notionBotId" TEXT,
ADD COLUMN     "ownerEmail" TEXT,
ADD COLUMN     "refreshTokenEncrypted" TEXT,
ADD COLUMN     "workspaceId" TEXT;
