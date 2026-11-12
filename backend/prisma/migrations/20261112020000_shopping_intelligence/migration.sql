CREATE TABLE "SavedProduct" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "productId" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "productId")
);
CREATE TABLE "ProductAlert" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "variantId" TEXT NOT NULL REFERENCES "ProductVariant"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('PRICE', 'STOCK')),
  "targetMinor" INTEGER CHECK ("targetMinor" > 0),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "generation" INTEGER NOT NULL DEFAULT 1,
  "triggeredAt" TIMESTAMP(3),
  "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "price_target_required" CHECK ("kind" != 'PRICE' OR "targetMinor" IS NOT NULL)
);
CREATE UNIQUE INDEX "ProductAlert_userId_variantId_kind_key" ON "ProductAlert"("userId", "variantId", "kind");
CREATE INDEX "ProductAlert_active_lastCheckedAt_idx" ON "ProductAlert"("active", "lastCheckedAt");
CREATE TABLE "StoreFollow" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "vendorId" TEXT NOT NULL REFERENCES "Vendor"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "vendorId")
);
CREATE TABLE "PricePoint" (
  "id" TEXT PRIMARY KEY,
  "variantId" TEXT NOT NULL REFERENCES "ProductVariant"("id") ON DELETE CASCADE,
  "priceMinor" INTEGER NOT NULL CHECK ("priceMinor" > 0),
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PricePoint_variantId_recordedAt_idx" ON "PricePoint"("variantId", "recordedAt");
