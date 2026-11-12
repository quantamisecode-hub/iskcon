# TC-28 — Operational Decision Center

# ⚠️ MODULE ABSENT — GAP RECORD

> **Inspection result (§3):** No Operational Decision Center exists — no router,
> service, schema model, or UI page (Ph-9 features from the Phase 11 brief:
> approval queue insights, decision recommendations, escalation views).
> Dashboard (`GET /dashboard/summary`) is the only aggregated operational view
> that ships today.

| ID | Feature | Priority | Type | Status |
|---|---|---|---|---|
| TC-DEC-001 | Pending-approval queue with aging/SLA view | P2 | MODULE ABSENT | GAP — no implementation |
| TC-DEC-002 | Decision recommendations (approve/reject hints) | P2 | MODULE ABSENT | GAP |
| TC-DEC-003 | Escalation of stale requests | P2 | MODULE ABSENT | GAP |
| TC-DEC-004 | Cross-event operational load view | P2 | MODULE ABSENT | GAP |

**Impact analysis:** the human decision workflow itself (approve/reject/issue
stage gates) is fully covered by TC-17…TC-21; only the ANALYTICS overlay is
missing. Certification (§62) must list this module as NOT SHIPPED.

## TC-28 roll-up
Cases: 4 (all GAP) · Automated: 0
