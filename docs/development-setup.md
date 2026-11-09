# Development Setup

A non-technical guide to get the project running on a fresh machine.

## 1. Install (once per machine)

1. Install Node.js (current LTS generation — v26 works), Git, and MySQL 8.0.
2. Copy this repository folder onto the machine.
3. Open a terminal in `food-inventory-system/` and run:

```bash
npm.cmd run setup
```

Wait until both installs finish (can take several minutes the first time).

## 2. Prepare environment files

Both folders already contain a local, Git-ignored `.env` configured for this
machine (database `food_inventory` and the dedicated MySQL user exist).

- `frontend/.env` — public API address only; keep as-is.
- `backend/.env` — holds `DATABASE_URL` (app user, not root), test and shadow
  DB URLs, cookie/rate-limit settings, and DEV seed credentials.
  Never paste these values into anything that gets committed.

## 3. Start the two apps (two terminals)

Terminal 1 — backend:

```bash
cd backend
npm.cmd run dev
```

Terminal 2 — frontend:

```bash
cd frontend
npm.cmd run dev
```

Open http://localhost:5173 — you should see the Phase 1 shell with
"API Status: Connected".

## 4. Verify at any time

| Check | How | Expected |
|-------|-----|----------|
| API alive | Open http://localhost:5000/api/v1/health | `API is healthy` |
| Database | http://localhost:5000/api/v1/health/db | `Database is reachable` |
| Login works | Sign in at http://localhost:5173/login | Redirects to Dashboard |
| Backend tests | `cd backend; npm.cmd run test` | All pass (auth + RBAC) |
| Code quality | `npm.cmd run lint` (root) | No errors |
| Build | `npm.cmd run build` (root) | Both builds succeed |

## 5. Prisma commands (run inside `backend/`)

```bash
npm.cmd run prisma:migrate   # create a NEW migration after schema changes (dev)
npm.cmd run prisma:deploy    # apply migrations safely (no reset) - CI/other machines
npm.cmd run prisma:seed      # create/refresh the two Development accounts
npx.cmd prisma validate      # quick schema check
```

NEVER run `prisma migrate reset` against the real database.

## 5. Troubleshooting

- *"npm.ps1 cannot be loaded"* — invoke npm as `npm.cmd` (already done
  throughout this project).
- *"ENVIRONMENT VALIDATION FAILED"* — the API refuses to start because a
  variable in `backend/.env` is missing/wrong. The console lists exactly
  which. Compare with `backend/.env.example`.
- MySQL password lost — create a new local user via MySQL Workbench instead
  of installing anything new.
