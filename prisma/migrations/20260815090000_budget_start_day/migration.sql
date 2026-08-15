-- Per-user budget period anchor day (Settings → Budget period).
--
-- DEFAULT 1 reproduces the previous behaviour exactly (calendar months:
-- 1st → last day), so existing users see no change until they pick a day.
-- Safe on populated tables: the default backfills existing rows in place.

ALTER TABLE "User" ADD COLUMN "budgetStartDay" INTEGER NOT NULL DEFAULT 1;
