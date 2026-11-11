ALTER TABLE "DeliveryReceipt" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_vendorOrderId_fkey" FOREIGN KEY ("vendorOrderId") REFERENCES "VendorOrder"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DisputeMessage" ADD CONSTRAINT "DisputeMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryReceipt" ADD CONSTRAINT "DeliveryReceipt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "OutboxEvent"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformPolicy" ADD CONSTRAINT "policy_values_valid" CHECK ("returnWindowDays" BETWEEN 1 AND 90 AND "restockingBps" BETWEEN 0 AND 5000 AND "reviewDelayDays" BETWEEN 1 AND 30 AND "payoutWeekday" BETWEEN 0 AND 6);
UPDATE "ReturnRequest" r SET "clawbackMinor"=v."vendorNetMinor" FROM "VendorOrder" v WHERE r."vendorOrderId"=v.id AND r."clawbackMinor"=0 AND r."restockingFeeMinor"=0;
