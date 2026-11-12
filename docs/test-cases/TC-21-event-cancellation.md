# TC-21 — Event Cancellation (§28–§34 full matrix)

**Repo surface:** `POST /events/:id/cancel` (adminOnly, reason mandatory 1–1000,
zod `cancelEventSchema`), `PATCH /events/:id/status {CANCELLED}` **delegates** to
`cancel()` (reason defaults to 'Cancelled by admin.'). One transaction: lock
event → stamp reason/actor/time → cascade **zero-issued** requests to
`CANCELLED_BY_EVENT` (+ items REQUESTED/APPROVED, timeline) → audit → §50
notifications (requesters + creator + assigned executors, minus actor) emitted
post-commit, plus dedicated `event:cancelled` channel. Cancellation NEVER moves stock.

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-CXL-001 | Reason mandatory; blank/whitespace/over-length rejected | P0 | NEGATIVE | ADMIN |

**Test data:** `{}`, `{"reason":"   "}`, 1001 chars.
**Expected:** 400 "A cancellation reason is required." / max-length validation;
event untouched.
**Status:** NOT EXECUTED · Automation: AUTOMATED — `event-material-lifecycle.test.ts`

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-CXL-002 | Executor cancel → 403; anonymous → 401 | P0 | AUTHORIZATION |

**Expected:** route guard 403; no state change.
**Status:** NOT EXECUTED · Automation: AUTOMATED — `event-material-lifecycle.test.ts`

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-CXL-003 | UI cancel modal sends reason to POST /cancel (not bare status patch) | P0 | E2E |

**Expected:** EventDetailPage modal requires reason; confirm button disabled
until non-empty; calls `POST /events/:id/cancel` with the reason; cancelled
panel shows reason + who + when; zero-issued note displayed.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-CXL-004 | NO request: event → CANCELLED, no notifications beyond §50 recipients | P0 | FUNCTIONAL |

**Expected:** status CANCELLED + reason + cancelledAt/cancelledBy; audit
`CANCEL_EVENT`; notifications to assigned executors + creator (not the actor).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-CXL-005 | PENDING_APPROVAL request (zero issued) cascades to CANCELLED_BY_EVENT | P0 | FUNCTIONAL |

**Expected:** request + items → `CANCELLED_BY_EVENT`; timeline row with reason +
event code; admin/executor notified §50; **stock unchanged**.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-CXL-006 | APPROVED (zero issued) request cascades the same way | P0 | FUNCTIONAL |

**Expected:** identical to TC-CXL-005 — approval state does not exempt cascade.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-CXL-007 | PARTIALLY_ISSUED / ISSUED request does NOT cascade | P0 | FUNCTIONAL |

**Expected:** issued requests stay untouched (issued history must remain
returnable); their status unchanged; only event flips to CANCELLED; request
timeline gains no fake rows.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-CXL-008 | Cancelled event still allows returns for issued material | P0 | INTEGRATION |

**Expected:** Return Materials button remains available on CANCELLED event
(eligibility = issued − acceptedReturned > 0, no status restriction); creating a
return for issued material succeeds after cancellation; stock unchanged until accept.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-CXL-009 | Cancellation never moves stock — any lifecycle state | P0 | DATABASE |

**Expected:** for every cancellation scenario above: inventory and ledger are
byte-identical before/after; no STOCK_OUT/RETURN transactions created by cancel().
**Status:** NOT EXECUTED · Automation: PARTIAL — `event-material-lifecycle.test.ts`

| ID | Feature | Priority | Type |
|---|---|
| TC-CXL-010 | §50 notification recipients + priority/category | P0 | INTEGRATION |

**Expected:** recipients = requesters of cascaded requests ∪ creator ∪ assigned
executors, MINUS actor; type `EVENT_CANCELLED`, category `EVENT`, priority
`HIGH`, referenceType `EVENT` (deep link /events/:id); message contains reason.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-CXL-011 | Double cancel / cancel terminal event → 409 | P0 | NEGATIVE |

**Expected:** cancelling a CANCELLED or COMPLETED event → 409 (CANCELLABLE =
DRAFT/PLANNING/READY); second call idempotent-safe.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-CXL-012 | PATCH /status CANCELLED delegation carries through | P1 | FUNCTIONAL |

**Expected:** status-patch path produces the same end state (reason recorded —
defaulted), same cascade + notifications as POST /cancel.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-CXL-013 | Realtime: executor receives notification:new + event:cancelled live | P0 | INTEGRATION |

**Expected:** socket delivery verified live (8/8 script run, 2026-11-10);
EventDetailPage of the executor live-refreshes the cancelled panel.
**Status:** PASS (live socket verification script; DB-persistence also covered)
· Automation: backend `npm run verify:realtime` (backend/scripts/verify-realtime.ts, manual run) + events.test.ts (persistence)

| ID | Feature | Priority | Type |
|---|---|
| TC-CXL-014 | Cancelled event detail: planning locked, history intact | P1 | E2E |

**Expected:** planning edits rejected (409); dishes/materials viewable;
additional-request button disabled; Return Materials enabled.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-CXL-015 | Pending return at cancel time is unaffected | P0 | FUNCTIONAL |

**Expected:** a return in `PENDING_ADMIN_REVIEW` survives event cancellation and
can still be accepted/rejected (stock reconciliation continues).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-21 roll-up
Cases: 15 · P0: 12 · Automated: 4 (event-material-lifecycle) + 1 PASS (live)
- The §28 matrix rows (no request / pending / approved / partially issued /
  fully issued / partially returned / fully returned / additional / pending return)
  are represented by TC-CXL-004…015; issued-vs-not-issued split is the critical line.
