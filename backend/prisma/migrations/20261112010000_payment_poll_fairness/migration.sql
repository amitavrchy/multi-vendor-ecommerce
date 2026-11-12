ALTER TABLE "Payment" ADD COLUMN "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "Payment_status_nextCheckAt_idx" ON "Payment"("status", "nextCheckAt");
