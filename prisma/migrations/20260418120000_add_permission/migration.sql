-- Per-DID permission flags. Bootstrapped from BRANCHLINE_ALLOWED_SEED_AUTHORS
-- on first app start, then managed via the UI.
CREATE TABLE "Permission" (
    "did" TEXT NOT NULL,
    "canGrantSeeds" BOOLEAN NOT NULL DEFAULT false,
    "canDeleteBuds" BOOLEAN NOT NULL DEFAULT false,
    "canLockBuds" BOOLEAN NOT NULL DEFAULT false,
    "canGrantPermissions" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("did")
);
