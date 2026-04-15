-- CreateTable
CREATE TABLE "Bud" (
    "uri" TEXT NOT NULL,
    "cid" TEXT NOT NULL,
    "authorDid" TEXT NOT NULL,
    "rootUri" TEXT NOT NULL,
    "parentUri" TEXT,
    "parentCid" TEXT,
    "depth" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "formatting" JSONB,
    "pathUris" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL,
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bud_pkey" PRIMARY KEY ("uri")
);

-- CreateTable
CREATE TABLE "Pollen" (
    "uri" TEXT NOT NULL,
    "authorDid" TEXT NOT NULL,
    "subjectUri" TEXT NOT NULL,
    "subjectCid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pollen_pkey" PRIMARY KEY ("uri")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "key" TEXT NOT NULL,
    "session" TEXT NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuthState" (
    "key" TEXT NOT NULL,
    "state" TEXT NOT NULL,

    CONSTRAINT "AuthState_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "did" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandleCache" (
    "did" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandleCache_pkey" PRIMARY KEY ("did")
);

-- CreateIndex
CREATE INDEX "Bud_rootUri_idx" ON "Bud"("rootUri");

-- CreateIndex
CREATE INDEX "Bud_parentUri_idx" ON "Bud"("parentUri");

-- CreateIndex
CREATE INDEX "Bud_authorDid_idx" ON "Bud"("authorDid");

-- CreateIndex
CREATE INDEX "Bud_createdAt_idx" ON "Bud"("createdAt");

-- CreateIndex
CREATE INDEX "Pollen_subjectUri_idx" ON "Pollen"("subjectUri");

-- CreateIndex
CREATE INDEX "Pollen_authorDid_idx" ON "Pollen"("authorDid");

-- CreateIndex
CREATE UNIQUE INDEX "Pollen_authorDid_subjectUri_key" ON "Pollen"("authorDid", "subjectUri");

-- CreateIndex
CREATE INDEX "UserSession_did_idx" ON "UserSession"("did");

-- AddForeignKey
ALTER TABLE "Bud" ADD CONSTRAINT "Bud_parentUri_fkey" FOREIGN KEY ("parentUri") REFERENCES "Bud"("uri") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pollen" ADD CONSTRAINT "Pollen_subjectUri_fkey" FOREIGN KEY ("subjectUri") REFERENCES "Bud"("uri") ON DELETE CASCADE ON UPDATE CASCADE;
