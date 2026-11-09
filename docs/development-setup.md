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

Both folders already contain a local, Git-ignored `.env`.

- `frontend/.env` — keep as-is for development.
- `backend/.env` — update `DATABASE_URL` once the local MySQL user and
  database exist (Phase 2 prepares them). Use a strong password; never
  commit it. `backend/.env.example` shows the required variables; only the
  listed variables are needed.

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
| Database | http://localhost:5000/api/v1/health/db | `Database is reachable` (after MySQL user exists) |
| Code quality | `npm.cmd run lint` (root) | No errors |
| Build | `npm.cmd run build` (root) | Both builds succeed |

## 5. Troubleshooting

- *"npm.ps1 cannot be loaded"* — invoke npm as `npm.cmd` (already done
  throughout this project).
- *"ENVIRONMENT VALIDATION FAILED"* — the API refuses to start because a
  variable in `backend/.env` is missing/wrong. The console lists exactly
  which. Compare with `backend/.env.example`.
- MySQL password lost — create a new local user via MySQL Workbench instead
  of installing anything new.
