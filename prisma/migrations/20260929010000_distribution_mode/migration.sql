-- Add an explicit distribution strategy without changing existing goal behavior.
CREATE TYPE "DistributionMode" AS ENUM ('DISTRIBUTED', 'ONE_TIME', 'DAILY');

ALTER TABLE "MonthlyGoal"
ADD COLUMN "distributionMode" "DistributionMode" NOT NULL DEFAULT 'DISTRIBUTED';
