-- Two kinds of ReindexJob: "discover" (relay crawl, existing) and
-- "targeted" (single DID surfaced by first-sight or login). `relay` is
-- null for targeted jobs; `did` is null for discover jobs.
ALTER TABLE "ReindexJob" ALTER COLUMN "relay" DROP NOT NULL;
ALTER TABLE "ReindexJob" ADD COLUMN "did" TEXT;

-- Dedup lookup for enqueueTargetedReindex — we skip enqueueing if any
-- job (in any status) already exists for this DID, so that backfill
-- happens exactly once per DID across the app's lifetime.
CREATE INDEX "ReindexJob_kind_did_idx" ON "ReindexJob"("kind", "did");
