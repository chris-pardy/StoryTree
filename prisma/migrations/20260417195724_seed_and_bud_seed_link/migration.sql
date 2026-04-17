-- CreateTable
CREATE TABLE "Seed" (
    "uri" TEXT NOT NULL,
    "cid" TEXT NOT NULL,
    "authorDid" TEXT NOT NULL,
    "granteeDid" TEXT NOT NULL,
    "grantorUri" TEXT,
    "chainUris" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Seed_pkey" PRIMARY KEY ("uri")
);

-- CreateIndex
CREATE UNIQUE INDEX "Seed_grantorUri_key" ON "Seed"("grantorUri");

-- CreateIndex
CREATE INDEX "Seed_authorDid_idx" ON "Seed"("authorDid");

-- CreateIndex
CREATE INDEX "Seed_granteeDid_idx" ON "Seed"("granteeDid");

-- CreateIndex
CREATE INDEX "Seed_createdAt_idx" ON "Seed"("createdAt");

-- AlterTable: add seed link columns as nullable first so existing rows can be backfilled.
ALTER TABLE "Bud" ADD COLUMN "seedUri" TEXT,
                  ADD COLUMN "seedCid" TEXT;

-- Backfill: synthesise one Seed per existing root bud (depth = 0), authored and
-- granted to the root bud's authorDid. Pre-seed data is synthetic dev/demo buds;
-- this is not indexable from any real PDS, so the synthesised uri/cid use a
-- `backfill-` prefix to make their provenance obvious in a scan of the table.
INSERT INTO "Seed" (
    "uri", "cid", "authorDid", "granteeDid", "grantorUri",
    "chainUris", "expiresAt", "createdAt", "indexedAt"
)
SELECT
    REPLACE("uri", '/ink.branchline.bud/', '/ink.branchline.seed/backfill-') AS "uri",
    'backfill-' || "cid" AS "cid",
    "authorDid",
    "authorDid",
    NULL,
    ARRAY[REPLACE("uri", '/ink.branchline.bud/', '/ink.branchline.seed/backfill-')],
    NULL,
    "createdAt",
    NOW()
FROM "Bud"
WHERE "depth" = 0;

-- Propagate the root's synthetic seed down every tree via rootUri.
UPDATE "Bud" b
SET "seedUri" = r."seedUri",
    "seedCid" = r."seedCid"
FROM (
    SELECT
        "uri" AS "rootUri",
        REPLACE("uri", '/ink.branchline.bud/', '/ink.branchline.seed/backfill-') AS "seedUri",
        'backfill-' || "cid" AS "seedCid"
    FROM "Bud"
    WHERE "depth" = 0
) r
WHERE b."rootUri" = r."rootUri";

-- Now that every row has values, enforce NOT NULL.
ALTER TABLE "Bud" ALTER COLUMN "seedUri" SET NOT NULL,
                  ALTER COLUMN "seedCid" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Bud_seedUri_idx" ON "Bud"("seedUri");

-- AddForeignKey
ALTER TABLE "Bud" ADD CONSTRAINT "Bud_seedUri_fkey" FOREIGN KEY ("seedUri") REFERENCES "Seed"("uri") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seed" ADD CONSTRAINT "Seed_grantorUri_fkey" FOREIGN KEY ("grantorUri") REFERENCES "Seed"("uri") ON DELETE SET NULL ON UPDATE CASCADE;
