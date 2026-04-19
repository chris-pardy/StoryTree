-- Long-running reindex jobs. See prisma/schema.prisma ReindexJob for notes.
CREATE TABLE "ReindexJob" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "relay" TEXT NOT NULL,
    "concurrency" INTEGER NOT NULL DEFAULT 8,
    "recordLimit" INTEGER,
    "cursor" TEXT,
    "scanned" INTEGER NOT NULL DEFAULT 0,
    "reindexed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errored" INTEGER NOT NULL DEFAULT 0,
    "lastDid" TEXT,
    "errorMessage" TEXT,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "workerId" TEXT,
    "heartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReindexJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReindexJob_status_idx" ON "ReindexJob"("status");

CREATE INDEX "ReindexJob_createdAt_idx" ON "ReindexJob"("createdAt");
