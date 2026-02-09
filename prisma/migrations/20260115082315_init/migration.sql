-- CreateTable
CREATE TABLE "url_checks" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isPhishing" BOOLEAN NOT NULL,
    "confidence" DOUBLE PRECISION,
    "reason" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "url_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "url_checks_url_key" ON "url_checks"("url");

-- CreateIndex
CREATE INDEX "url_checks_url_idx" ON "url_checks"("url");
