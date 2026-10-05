-- Parser rules fall through: every rule whose sender and subject match is tried
-- in priority order until one parses the body. `priority` makes that order
-- explicit (it used to be the rule name); `parseError` records which rules were
-- tried when none of them parsed.

ALTER TABLE "ParserRule" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 100;

ALTER TABLE "RawEmail" ADD COLUMN "parseError" TEXT;

-- Under first-rule-claims, a failed email pointed at the rule that claimed it.
-- A failure now belongs to no single rule, so drop those stale links; the
-- emails stay `failed` until re-parsed, which fills in `parseError`.
UPDATE "RawEmail" SET "matchedRuleId" = NULL WHERE "parseStatus" = 'failed';
