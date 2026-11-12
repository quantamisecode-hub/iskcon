# TC-42 — Export Security

# ⚠️ MODULE ABSENT — GAP RECORD (defense-in-depth record for when exports ship)

> **Inspection result (§3):** zero export/CSV/XLSX endpoints exist anywhere in
> the API (grep across all 16 routers). No Reports module (TC-29). This file
> records the security expectations that WILL apply the moment an export is
> added, so the gap cannot be closed without passing these.

| ID | Feature | Priority | Type | Status |
|---|---|---|---|---|
| TC-EXP-001 | Export requires explicit auth + role check | P0 | SECURITY | GAP — no export endpoint |
| TC-EXP-002 | Export is scope-filtered (never leaks other admins' data) | P0 | SECURITY | GAP |
| TC-EXP-003 | CSV injection neutralized (=cmd, @SUM, \|cmd, %0A prefixes) | P0 | SECURITY | GAP |
| TC-EXP-004 | Generated files: sanitized names, size caps, no path traversal | P1 | SECURITY | GAP |
| TC-EXP-005 | No sensitive columns (passwordHash/tokens) in any export | P0 | SECURITY | GAP |
| TC-EXP-006 | Export rate-limited + audited | P1 | SECURITY | GAP |

**Interim risk assessment:** with no export surface, the export-attack class is
currently CLOSED by absence (nothing to attack). Certification must re-run this
file if/when exports are implemented.

## TC-42 roll-up
Cases: 6 (all GAP) · Automated: 0
