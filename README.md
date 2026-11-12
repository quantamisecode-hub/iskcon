# Food Inventory System

A secure **Event-Based Food Inventory & Material Management System** — a dedicated
application to manage kitchen food, events, inventory materials, material
requests, approvals, stock issue/return, and notifications.

**Status:** Phase 2 complete — database foundation, authentication (login/logout/session via secure
HTTP-only cookies), role-based access control (ADMIN / EXECUTOR), user management, Admin → Executor
assignments, and audit logging. Business modules (events, inventory, requests…) arrive in later phases.

---

## 1. Project overview

The final system will let Admins and Executors cooperate safely:

- Admin creates events, dishes, and inventory items; assigns Executors.
- Executors request materials; Admin approves; stock is issued and later
  returned or audited.
- Everything sensitive (passwords, database, secrets) stays on the backend —
  the browser app (frontend) never touches the database directly.

**Architecture in one sentence:**

```
React (browser)  ->  Node.js API  ->  Prisma  ->  MySQL
        no direct database access from the browser, ever
```

## 2. Technology stack

| Area | Technology |
|------|-----------|
| Frontend | React 19, Vite 7, TypeScript, React Router, Axios, Tailwind CSS |
| Backend | Node.js 26, Express 5, TypeScript, Prisma ORM, Zod validation |
| Database | MySQL 8.0 |
| Passwords | Argon2id (OWASP parameters: 19 MiB, time cost 2, parallelism 1) |
| Sessions | Random 256-bit tokens, stored only as SHA-256 hashes |
| Security | Helmet, CORS allowlist, CSRF origin validation, rate limiting, strict env validation |
| Quality | ESLint, Prettier, strict TypeScript, vitest (backend integration tests) |
| Version control | Git |

## 3. Folder structure

```
food-inventory-system/
├── frontend/          Browser application (React) — login, session context,
│                      role-aware navigation, protected routes
├── backend/           Server application (Node.js API + database access)
│   └── prisma/        schema, seed, migrations (User, Session,
│                      AdminExecutorAssignment, AuditLog)
├── docs/              Project documentation for everyone to read
├── .gitignore         Keeps secrets and machine files out of Git
├── README.md          This file
└── package.json       Root helpers (start both apps, build all, lint all)
```

## 4. Prerequisites (already installed on this machine)

- Node.js 26 and npm
- Git
- MySQL 8.0 (service `MySQL80`), database `food_inventory` created
- A dedicated MySQL account `food_inventory_user` (only database-level privileges)

## 5. Installation

```bash
npm.cmd run setup            # installs frontend + backend packages (once)
cd backend
npm.cmd run prisma:deploy    # applies database migrations (safe, no reset)
npm.cmd run prisma:seed      # creates the two Development accounts (env-based passwords)
```

## 6. Environment variables

- `backend/.env` (Git-ignored) holds the real values:
  `DATABASE_URL` (app MySQL user), `FIS_TEST_DATABASE_URL` (tests),
  `SHADOW_DATABASE_URL` (migration tooling), `CORS_ORIGIN`, cookie & rate
  limit settings, and `DEV_ADMIN_*` / `DEV_EXECUTOR_*` seed credentials.
- `backend/.env.example` lists every variable with placeholders only —
  it is committed; the real `.env` never is.
- `frontend/.env.development` / `.env.production` contain ONLY public
  `VITE_API_URL` (full API root including `/api/v1`) and timeout — no
  secrets are allowed there by policy.

## 7. How to run the frontend

```bash
cd frontend
npm.cmd run dev
```

Open http://localhost:5173 (Ctrl+C to stop).

## 8. How to run the backend

```bash
cd backend
npm.cmd run dev
```

The API listens on http://localhost:5000 (Ctrl+C to stop).

## 9. Checking code quality and tests

```bash
npm.cmd run lint                    # lint frontend AND backend from root
cd backend; npm.cmd run test        # backend integration tests (auth + RBAC)
```

## 10. How to build

```bash
npm.cmd run build                   # backend + frontend production builds
```

## 11. Authentication architecture (Phase 2)

1. `POST /api/v1/auth/login` → the backend validates email + Argon2id password
   hash, creates a `Session` row (storing only the SHA-256 **hash** of a new
   random token), and sets the token as an **HttpOnly cookie** (`fis_session`).
2. Every authenticated request sends the cookie; the backend middleware
   `authenticateSession` resolves it server-side and attaches the user —
   the browser can never claim a role.
3. `POST /api/v1/auth/logout` revokes the session (old token dead) and clears
   the cookie. `GET /api/v1/auth/me` returns the safe profile.
4. Nothing is stored in localStorage/sessionStorage — JavaScript never
   touches the session token (XSS-proof).

## 12. RBAC: ADMIN and EXECUTOR

- The role comes only from the database via the session — spoof-proof.
- `requireRole('ADMIN')` / `requireRole('EXECUTOR')` backend middleware.
- `/api/v1/users*` and `/api/v1/assignments*` are ADMIN-only.
- The frontend mirrors this with `ProtectedRoute` + `RoleGuard` (UX only).

## 13. Assignment model (Admin → Executor, with history)

- `AdminExecutorAssignment` preserves history: ending an assignment marks
  `isActive=false` + `unassignedAt`; records are never deleted.
- The Admin side of every assignment is always the session-authenticated
  admin; a duplicate ACTIVE assignment is impossible (row-lock guarded
  transaction).
- Future phases (Events, Requests, Approvals) will filter data by these
  historical assignments.

## 14. Security notes (current state)

Helmet headers, CORS allowlist, CSRF origin validation on state-changing
requests, strict rate limit on `/auth/login`, request-size limits, request
IDs, structured redacted logging, fail-fast env validation, sanitized errors,
and audit logging of LOGIN / LOGOUT / USER / ROLE / ASSIGNMENT actions.
Full detail (IMPLEMENTED vs PLANNED): `docs/security-baseline.md`.
Tests prove the RBAC matrix: see `backend/tests/auth-rbac.test.ts`.

## 15. Root convenience commands

| Command | Does what |
|---------|-----------|
| `npm.cmd run setup` | Install both apps' dependencies |
| `npm.cmd run dev:backend` / `dev:frontend` | Start the API / web UI |
| `npm.cmd run lint` | Lint both apps |
| `npm.cmd run build` | Build both apps |
| backend: `prisma:migrate` `prisma:deploy` `prisma:seed` `test` | Migrations / seed / tests |
