-- Add pending signup tracking for agent/reseller approvals
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "signupStatus" TEXT NOT NULL DEFAULT 'APPROVED';