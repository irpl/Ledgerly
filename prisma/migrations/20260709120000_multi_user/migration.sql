-- Multi-user conversion: tenancy columns, Jan backfill, per-user uniques, inbound routing.
--
-- Hand-ordered from `prisma migrate diff` output: the naive diff emits
-- `ADD COLUMN ... NOT NULL`, which fails on populated tables. Order here is:
--   1) Role enum + new User columns (inboundKey backfilled before NOT NULL)
--   2) nullable userId columns on all tenant-root tables (+ RawEmail.toAddress)
--   3) guarded insert of the legacy-data owner (Jan) — skipped on fresh databases
--   4) backfill every unowned row to her
--   5) SET NOT NULL (all except RawEmail.userId, where NULL = unrouted email)
--   6) unique swaps, new indexes, ForwardAddress table, FKs
-- The whole file runs in one transaction under `prisma migrate deploy`.

-- 1) Role enum + User columns
CREATE TYPE "Role" AS ENUM ('admin', 'user');

ALTER TABLE "User" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'user';
ALTER TABLE "User" ADD COLUMN "displayName" TEXT;
ALTER TABLE "User" ADD COLUMN "inboundKey" TEXT;

UPDATE "User" SET "inboundKey" = md5(gen_random_uuid()::text) WHERE "inboundKey" IS NULL;

ALTER TABLE "User" ALTER COLUMN "inboundKey" SET NOT NULL;
CREATE UNIQUE INDEX "User_inboundKey_key" ON "User"("inboundKey");

-- 2) Nullable tenancy columns
ALTER TABLE "Account"    ADD COLUMN "userId" TEXT;
ALTER TABLE "Category"   ADD COLUMN "userId" TEXT;
ALTER TABLE "Vendor"     ADD COLUMN "userId" TEXT;
ALTER TABLE "ParserRule" ADD COLUMN "userId" TEXT;
ALTER TABLE "BudgetLine" ADD COLUMN "userId" TEXT;
ALTER TABLE "IncomePlan" ADD COLUMN "userId" TEXT;
ALTER TABLE "RawEmail"   ADD COLUMN "userId" TEXT;
ALTER TABLE "RawEmail"   ADD COLUMN "toAddress" TEXT;

-- 3) Create the owner of all pre-multi-user data (Jan) — only when legacy rows
-- exist, so fresh databases never grow this user. The bcrypt hash is of a
-- random password generated at migration-authoring time and discarded; the
-- account cannot be logged into until an admin resets its password.
INSERT INTO "User" ("id", "email", "passwordHash", "role", "inboundKey", "createdAt")
SELECT 'usr_jan_backfill',
       'wgs.janay.bryant@gmail.com',
       '$2b$12$ICnh3ga0r.vB5j4VHGtS1Oe/HH3RR4ra75HBmhlJKy35H/6UI7S/m',
       'user',
       md5(gen_random_uuid()::text),
       now()
WHERE EXISTS (SELECT 1 FROM "Account"    WHERE "userId" IS NULL)
   OR EXISTS (SELECT 1 FROM "Category"   WHERE "userId" IS NULL)
   OR EXISTS (SELECT 1 FROM "Vendor"     WHERE "userId" IS NULL)
   OR EXISTS (SELECT 1 FROM "ParserRule" WHERE "userId" IS NULL)
   OR EXISTS (SELECT 1 FROM "BudgetLine" WHERE "userId" IS NULL)
   OR EXISTS (SELECT 1 FROM "IncomePlan" WHERE "userId" IS NULL)
   OR EXISTS (SELECT 1 FROM "RawEmail"   WHERE "userId" IS NULL)
ON CONFLICT ("email") DO NOTHING;

-- 4) Backfill unowned rows
UPDATE "Account"    SET "userId" = (SELECT "id" FROM "User" WHERE "email" = 'wgs.janay.bryant@gmail.com') WHERE "userId" IS NULL;
UPDATE "Category"   SET "userId" = (SELECT "id" FROM "User" WHERE "email" = 'wgs.janay.bryant@gmail.com') WHERE "userId" IS NULL;
UPDATE "Vendor"     SET "userId" = (SELECT "id" FROM "User" WHERE "email" = 'wgs.janay.bryant@gmail.com') WHERE "userId" IS NULL;
UPDATE "ParserRule" SET "userId" = (SELECT "id" FROM "User" WHERE "email" = 'wgs.janay.bryant@gmail.com') WHERE "userId" IS NULL;
UPDATE "BudgetLine" SET "userId" = (SELECT "id" FROM "User" WHERE "email" = 'wgs.janay.bryant@gmail.com') WHERE "userId" IS NULL;
UPDATE "IncomePlan" SET "userId" = (SELECT "id" FROM "User" WHERE "email" = 'wgs.janay.bryant@gmail.com') WHERE "userId" IS NULL;
UPDATE "RawEmail"   SET "userId" = (SELECT "id" FROM "User" WHERE "email" = 'wgs.janay.bryant@gmail.com') WHERE "userId" IS NULL;

-- 5) NOT NULL (RawEmail.userId intentionally stays nullable = unrouted)
ALTER TABLE "Account"    ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Category"   ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Vendor"     ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "ParserRule" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "BudgetLine" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "IncomePlan" ALTER COLUMN "userId" SET NOT NULL;

-- 6) Unique swaps
DROP INDEX "Category_name_kind_key";
CREATE UNIQUE INDEX "Category_userId_name_kind_key" ON "Category"("userId", "name", "kind");
DROP INDEX "Vendor_nameNormalized_key";
CREATE UNIQUE INDEX "Vendor_userId_nameNormalized_key" ON "Vendor"("userId", "nameNormalized");

-- New indexes
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE INDEX "BudgetLine_userId_idx" ON "BudgetLine"("userId");
CREATE INDEX "IncomePlan_userId_idx" ON "IncomePlan"("userId");
CREATE INDEX "RawEmail_userId_parseStatus_idx" ON "RawEmail"("userId", "parseStatus");
CREATE INDEX "ParserRule_userId_idx" ON "ParserRule"("userId");

-- ForwardAddress (sender-address → user routing for manual forwards)
CREATE TABLE "ForwardAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForwardAddress_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ForwardAddress_address_key" ON "ForwardAddress"("address");
CREATE INDEX "ForwardAddress_userId_idx" ON "ForwardAddress"("userId");

-- Foreign keys (after backfill so validation passes)
ALTER TABLE "ForwardAddress" ADD CONSTRAINT "ForwardAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Account"    ADD CONSTRAINT "Account_userId_fkey"    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Category"   ADD CONSTRAINT "Category_userId_fkey"   FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vendor"     ADD CONSTRAINT "Vendor_userId_fkey"     FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParserRule" ADD CONSTRAINT "ParserRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncomePlan" ADD CONSTRAINT "IncomePlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RawEmail"   ADD CONSTRAINT "RawEmail_userId_fkey"   FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
