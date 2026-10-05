# Issue: the first rule whose sender and subject match claims the email, so later rules never run

**Status: fixed in 0.10.0** (see "Resolution" at the end). Reported 2026-10-05 from a live account (Phillip's). Found while debugging Uber receipts that weren't parsing.

## Summary

`applyParserRules` (`src/lib/email-parser.ts:116`) loops over the user's rules
and gives the email to the **first rule whose sender and subject match**. If that
rule's body pattern fails, the email is marked `failed` and the loop **returns**.
Other rules with the same sender and subject are never tried, even when one of
them would match the body.

So one sender can't have two rules that tell its email types apart by body
content, and a rule's priority depends on where its name sorts.

## What happened

The user had two rules for the same sender and subject:

| Rule (name) | senderMatch | subjectPattern | bodyPattern starts with |
|---|---|---|---|
| `Uber — tip (separate transaction)` | `noreply@uber.com` | `trip with Uber` | `Thanks for tipping…` |
| `Uber — trip fare (charge summary)` | `noreply@uber.com` | `trip with Uber` | `This is your charge summary…` |

Uber sends three kinds of email, all with subjects like "Your Sunday evening trip with Uber":
1. a charge summary (should match the fare rule),
2. a "Thanks for riding" receipt (meant to match neither rule, since it's the same trip again),
3. a "Thanks for tipping" receipt (should match the tip rule).

Rules are ordered by `name` ascending (`email-parser.ts:121`). "Uber — **ti**p" sorts
before "Uber — **tr**ip", so the tip rule claimed **every** Uber email. Its body
pattern failed on charge summaries and receipts, so all 6 Uber emails received
on Oct 4–5 ended up `failed`. The fare rule showed `matchedEmails: 0`, and the
tip rule showed `matchedEmails: 6` even though none of those emails was a tip email.

Evidence from `reparse_email` on a charge summary (`cmuueunm300054buv4ioimzah`):

```json
{ "status": "failed", "ruleId": "cmurr96ss00154irse9v0zt5o",
  "reason": "Body pattern did not match or has no `amount` group" }
```

`ruleId` is the tip rule. Running the fare rule's pattern on its own against the same body
returns `amount: 494.77`, so the pattern is fine. Only the routing is wrong.

## Why it's a problem

- **It fails without warning.** The error names one rule and says "body pattern did not
  match". That reads like a broken regex, not like a different rule never being tried.
- **The order is accidental.** Priority comes from the alphabetical order of rule names,
  so renaming a rule can change which rule handles an email.
- **It's a common need.** Banks and merchants send several alert types from one address,
  and sometimes with one subject line. Scotiabank already has 6 rules on `alerts@scotiabank.com`
  in this account; they work only because their subjects happen to differ.
- **The `matchedEmails` count misleads.** It counts emails a rule *claimed*, not emails it parsed.

## Expected behaviour

These are the requirements. How to meet them is up to whoever implements it:

1. If a rule's sender and subject match but its body doesn't, **try the next eligible rule**
   instead of failing the email.
2. **At most one transaction per email.** No email should produce two transactions
   because two rules matched.
3. **Keep the sender check as a safety gate.** Never try a rule whose sender doesn't match.
4. **Make rule order deliberate and visible**, not a side effect of the name.
5. When nothing matches, the `failed` outcome should say **which rules were tried**
   (or at least how many), so the user can tell "no rule fits" apart from "my regex is wrong".
6. `matchedEmails` (or a new count) should show **successful** parses per rule.

## One possible approach (a suggestion; the builder has more context)

Treat the sender and subject check as a filter for candidates, try each candidate's body
pattern in order, and stop at the first success. Return `failed` only after every
candidate fails, and include all the candidate rule ids. Swapping the
`return markOutcome(…failed…)` inside the loop for "record and `continue`" probably covers
most of it. An explicit `priority` field could replace `orderBy: { name: "asc" }`.

The cost is negligible: a few extra regex runs per email.

## Workaround in place now (Phillip's account)

To unblock the account, the two Uber rules were merged into one, so these changes can be
undone once the fix ships:

- The fare rule `cmurr95ef00144irsi3abyzie` was renamed "Uber — trip fare (charge summary) or tip".
  Its body pattern is now
  `(?:This is your charge summary[\s\S]*?Total|Thanks for tipping[\s\S]*?\bTip\b)[^0-9]{0,20}JMD\s*(?<amount>[\d,]+\.\d{2})(?=[\s\S]*(?<merchant>Uber) B\.V\.)`.
- The tip rule `cmurr96ss00154irse9v0zt5o` was disabled by setting `subjectPattern`
  to `^__disabled__$`. It wasn't deleted.
  - **The rename moved it in the order.** "Uber — tip (DISABLED…)" still sorts first. It only
    stops claiming emails because its subject can no longer match.
- The re-parse of `cmuueunm300054buv4ioimzah` now succeeds:
  pending −J$494.77, Uber, Scotia Mastercard \*5907.

## Separate, unconfirmed observation

Phillip also manually forwarded these Uber emails ("Fwd: …", sent from `phillipllogan@gmail.com`
to the user's import address on Oct 1–5). None of them appear in the review queue, not even as
`failed`. The cause could be `ForwardAddress` routing, deduplication or something else; this
wasn't investigated. It's worth a separate look.

## Resolution (0.10.0)

- `applyParserRules` now treats sender + subject as a candidate filter and tries
  each candidate's body pattern in order; the first success wins and creates the
  only transaction. `failed` happens only after every candidate fails.
- New `ParserRule.priority` (default 100, lower first, ties by name) sets the
  order. It is editable in the rule form and via `create_parser_rule` /
  `update_parser_rule`, and shown on each rule row.
- New `RawEmail.parseError` stores the failure reason, which names every rule
  tried ("Tried 2 rules for this sender and subject; none parsed: …"). It is
  shown under failed emails on /review and returned by `list_review_queue`.
  The `failed` outcome carries `attempts: [{ ruleId, ruleName, reason }]`.
- Rule counts now show successful parses only (`parsedEmails` in
  `list_parser_rules`, "N parsed" on /review). Failed emails no longer set
  `matchedRuleId`.
- Migration: `prisma/migrations/20261005120000_parser_rule_priority`. It also clears `matchedRuleId` on
  emails that were already `failed`, since those links pointed at whichever rule
  had claimed them.
- Two simultaneous re-parses of one email (`/api/raw-emails/[id]/reparse`,
  `reparse_email`) now get the same "already created a transaction" 409 /
  tool error as a sequential one, instead of a 500 from the unique
  `Transaction.rawEmailId` constraint (`lostParseRace` in `email-parser.ts`).

Once deployed, the workaround above can be undone: restore the tip rule's
subject pattern (`trip with Uber`) and the fare rule's original body pattern,
then re-parse the failed Uber emails.
