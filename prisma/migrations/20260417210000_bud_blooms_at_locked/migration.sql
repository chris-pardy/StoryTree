-- AlterTable: add bloomsAt as nullable first so existing rows can be backfilled,
-- and locked with a default.
ALTER TABLE "Bud" ADD COLUMN "bloomsAt" TIMESTAMP(3),
                  ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: set bloomsAt to createdAt + 24 hours for all existing buds.
UPDATE "Bud" SET "bloomsAt" = "createdAt" + INTERVAL '24 hours';

-- Now that every row has a value, enforce NOT NULL.
ALTER TABLE "Bud" ALTER COLUMN "bloomsAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Bud_bloomsAt_idx" ON "Bud"("bloomsAt");
