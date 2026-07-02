-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('checking', 'savings', 'cash', 'credit_card', 'loan', 'investment', 'pension', 'ewallet', 'other');

-- CreateEnum
CREATE TYPE "LoanKind" AS ENUM ('mortgage', 'auto', 'bank', 'personal', 'other');

-- CreateEnum
CREATE TYPE "FxSource" AS ENUM ('auto', 'manual');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('expense', 'income', 'both');

-- CreateEnum
CREATE TYPE "TransactionSource" AS ENUM ('manual', 'email');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('confirmed', 'pending_review');

-- CreateEnum
CREATE TYPE "BudgetFrequency" AS ENUM ('weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'credit');

-- CreateEnum
CREATE TYPE "ParseStatus" AS ENUM ('unparsed', 'parsed', 'failed', 'ignored');

-- CreateEnum
CREATE TYPE "TxnDirection" AS ENUM ('outflow', 'inflow');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'JMD',
    "openingBalance" BIGINT NOT NULL DEFAULT 0,
    "currentBalance" BIGINT NOT NULL DEFAULT 0,
    "creditLimit" BIGINT,
    "color" TEXT,
    "icon" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanDetails" (
    "accountId" TEXT NOT NULL,
    "loanKind" "LoanKind" NOT NULL,
    "originalPrincipal" BIGINT NOT NULL,
    "interestRate" DECIMAL(6,3) NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "monthlyPayment" BIGINT NOT NULL,
    "monthlyBudget" BIGINT,
    "lender" TEXT,
    "nextPaymentDate" TIMESTAMP(3),

    CONSTRAINT "LoanDetails_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rate" DECIMAL(14,6) NOT NULL,
    "asOf" DATE NOT NULL,
    "source" "FxSource" NOT NULL DEFAULT 'manual',

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    "parentId" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "defaultCategoryId" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "categoryId" TEXT,
    "vendorId" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "source" "TransactionSource" NOT NULL DEFAULT 'manual',
    "status" "TransactionStatus" NOT NULL DEFAULT 'confirmed',
    "rawEmailId" TEXT,
    "transferGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "frequency" "BudgetFrequency" NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "fundingAccountId" TEXT NOT NULL,
    "normalizedMonthly" BIGINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetPeriodActual" (
    "id" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "budgeted" BIGINT NOT NULL,
    "spent" BIGINT NOT NULL,

    CONSTRAINT "BudgetPeriodActual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomePlan" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "monthlyAmount" BIGINT NOT NULL,

    CONSTRAINT "IncomePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawEmail" (
    "id" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "matchedRuleId" TEXT,
    "parseStatus" "ParseStatus" NOT NULL DEFAULT 'unparsed',
    "createdTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParserRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "senderMatch" TEXT NOT NULL,
    "subjectPattern" TEXT,
    "bodyPattern" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "defaultDirection" "TxnDirection" NOT NULL DEFAULT 'outflow',

    CONSTRAINT "ParserRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_fromCurrency_toCurrency_asOf_key" ON "FxRate"("fromCurrency", "toCurrency", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_kind_key" ON "Category"("name", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_nameNormalized_key" ON "Vendor"("nameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_rawEmailId_key" ON "Transaction"("rawEmailId");

-- CreateIndex
CREATE INDEX "Transaction_accountId_occurredAt_idx" ON "Transaction"("accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "Transaction_transferGroupId_idx" ON "Transaction"("transferGroupId");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetPeriodActual_periodLabel_categoryId_key" ON "BudgetPeriodActual"("periodLabel", "categoryId");

-- AddForeignKey
ALTER TABLE "LoanDetails" ADD CONSTRAINT "LoanDetails_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_defaultCategoryId_fkey" FOREIGN KEY ("defaultCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_rawEmailId_fkey" FOREIGN KEY ("rawEmailId") REFERENCES "RawEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_fundingAccountId_fkey" FOREIGN KEY ("fundingAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetPeriodActual" ADD CONSTRAINT "BudgetPeriodActual_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawEmail" ADD CONSTRAINT "RawEmail_matchedRuleId_fkey" FOREIGN KEY ("matchedRuleId") REFERENCES "ParserRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParserRule" ADD CONSTRAINT "ParserRule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

