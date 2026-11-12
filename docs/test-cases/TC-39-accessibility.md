# TC-39 — Accessibility (WCAG 2.1 AA intent)

**Method:** browser-driven (keyboard-only passes + computed-style checks); no
full aXe tooling wired yet — record tool gap honestly.

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-A11Y-001 | Keyboard-only navigation of core flows | P0 | ACCESSIBILITY |

**Flows:** login → dashboard → event create → request submit → logout.
**Expected:** every interactive control reachable + operable by keyboard alone;
visible focus indicators; no keyboard traps; tab order logical.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-A11Y-002 | Forms have programmatic labels + errors announced | P0 | ACCESSIBILITY |

**Expected:** all inputs have associated labels; required fields marked; error
messages linked via aria-describedby (record actual); modal cancel-reason
focus-trapped with labelled heading.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-A11Y-003 | Color contrast ≥ 4.5:1 body text | P1 | ACCESSIBILITY |

**Expected:** theme tokens pass on all pages sampled (login, dashboard, event
detail, tables); status badges readable (record list of failures if any).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-A11Y-004 | ARIA roles on widgets (tabs, modals, tables, badges) | P1 | ACCESSIBILITY |

**Expected:** dialog role + aria-modal on modals; tables use th/scope; live
regions announce socket-driven updates (toast/live area) politely.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-A11Y-005 | Status conveyed by more than color | P1 | ACCESSIBILITY |

**Expected:** REQUEST/RETURN/stock states pair color with text/icon; low-stock badges have text.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-39 roll-up
Cases: 5 · P0: 2 · Automated: 0
