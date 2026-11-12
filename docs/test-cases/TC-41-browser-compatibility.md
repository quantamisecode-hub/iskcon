# TC-41 — Browser Compatibility

**Method:** primary engine in-session is Chromium. Record honest coverage: other
engines verified only via standards-level checks (no Safari/Firefox instance
available locally — mark BLOCKED, not PASS).

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-BRW-001 | Chromium: full smoke of core flows | P0 | E2E |

**Expected:** login, event create/ready/cancel, request submit→issue, return
create→accept, notifications, §39 render — all PASS with zero console errors.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-BRW-002 | Web standards audit (features used) | P1 | INTEGRATION |

**Steps:** list browser APIs used by the bundle (socket.io websocket, cookies,
fetch, URL APIs, CSS grid/flex).
**Expected:** all features are evergreen-standard; no IE-only or experimental-with-fallback-missing APIs.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-BRW-003 | Firefox / Safari / Edge render pass | P1 | E2E |

**Expected:** identical core flows; layout parity.
**Status:** BLOCKED (no other engine available locally — requires multi-engine environment; do not claim PASS)

| ID | Feature | Priority | Type |
|---|---|
| TC-BRW-004 | Mobile-web sanity (touch emulation) | P2 | RESPONSIVE |

**Expected:** touch events, viewport meta, no hover-dependent-only actions.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-41 roll-up
Cases: 4 · P0: 1 · BLOCKED: 1 (needs engine matrix)
