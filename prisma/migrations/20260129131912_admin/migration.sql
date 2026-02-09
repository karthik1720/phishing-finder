-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('BLOCKED', 'ALLOWED', 'WARNING_SHOWN');

-- AlterTable
ALTER TABLE "url_checks" ADD COLUMN     "hasWarning" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "userId" TEXT,
ADD COLUMN     "warningReason" TEXT,
ADD COLUMN     "warningSeverity" TEXT,
ADD COLUMN     "warningType" TEXT;

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isPhishing" BOOLEAN NOT NULL,
    "hasWarning" BOOLEAN NOT NULL DEFAULT false,
    "warningType" TEXT,
    "warningSeverity" TEXT,
    "warningReason" TEXT,
    "action" "AuditAction" NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "audit_records_userId_idx" ON "audit_records"("userId");

-- CreateIndex
CREATE INDEX "audit_records_visitedAt_idx" ON "audit_records"("visitedAt");

-- CreateIndex
CREATE INDEX "audit_records_action_idx" ON "audit_records"("action");

-- AddForeignKey
ALTER TABLE "audit_records" ADD CONSTRAINT "audit_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
