-- DropIndex
DROP INDEX "ReturnRequest_vendorOrderId_key";

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "funding" TEXT NOT NULL DEFAULT 'PLATFORM';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "refundRef" TEXT;

-- AlterTable
ALTER TABLE "PayoutBatch" ADD COLUMN     "scheduleKey" TEXT;

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "returnRequestId" TEXT;

-- AlterTable
ALTER TABLE "ReturnRequest" ADD COLUMN     "clawbackMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "restockingFeeMinor" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "VendorOrder" ADD COLUMN     "paymentFeeMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vendorFundedDiscountMinor" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PlatformPolicy" (
    "id" TEXT NOT NULL DEFAULT 'marketplace',
    "returnWindowDays" INTEGER NOT NULL DEFAULT 14,
    "restockingBps" INTEGER NOT NULL DEFAULT 0,
    "weeklyPayouts" BOOLEAN NOT NULL DEFAULT false,
    "payoutWeekday" INTEGER NOT NULL DEFAULT 1,
    "reviewDelayDays" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "PlatformPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "vendorOrderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeMessage" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryReceipt" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerRef" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "DeliveryReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Upload_objectKey_key" ON "Upload"("objectKey");

-- CreateIndex
CREATE INDEX "Dispute_userId_status_idx" ON "Dispute"("userId", "status");

-- CreateIndex
CREATE INDEX "Dispute_vendorOrderId_idx" ON "Dispute"("vendorOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryReceipt_eventId_channel_key" ON "DeliveryReceipt"("eventId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutBatch_scheduleKey_key" ON "PayoutBatch"("scheduleKey");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_returnRequestId_key" ON "Refund"("returnRequestId");

-- CreateIndex
CREATE INDEX "ReturnRequest_vendorOrderId_idx" ON "ReturnRequest"("vendorOrderId");

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeMessage" ADD CONSTRAINT "DisputeMessage_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
