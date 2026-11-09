# Food Inventory System

A secure **Event-Based Food Inventory & Material Management System** — a dedicated
application to manage kitchen food, events, inventory materials, material
requests, approvals, stock issue/return, and notifications.

This repository currently contains **Phase 1 only**: the secure development
foundation. No business features (inventory, events, login screens, etc.) exist
yet — on purpose. Later phases build the real system on top of this base.

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
| Security | Helmet, CORS allowlist, rate limiting, strict env validation |
| Quality | ESLint, Prettier, strict TypeScript |
| Version control | Git |

## 3. Folder structure

```
food-inventory-system/
├── frontend/          Browser application (React)
├── backend/           Server application (Node.js API + database access)
├── docs/              Project documentation for everyone to read
├── .gitignore         Keeps secrets and machine files out of Git
├── README.md          This file
└── package.json       Root helpers (start both apps, build all, lint all)
```

## 4. Prerequisites (already installed on this machine)

- Node.js 26 and npm
- Git
- MySQL 8.0 (service `MySQL80`)
- Any MySQL graphical tool such as MySQL Workbench (optional, included with mysql)

## 5. Installation

Open a terminal in this folder and run once:

```bash
npm.cmd run setup
```

That installs all packages for the frontend and backend (a few minutes).

## 6. Environment variables

Environment variables are project settings kept outside the code so secrets
are never committed to Git.

- `frontend/.env.example` — public settings only (API address).
- `backend/.env.example` — server settings (database address, security limits).

Each folder already has a working local `.env` (not committed to Git).
When the MySQL user is created in Phase 2, edit `backend/.env` and replace:

```
DATABASE_URL=\"mysql://USERNAME:PASSWORD@localhost:3306/DATABASE_NAME\"
```

with the real username, a **strong password**, and the database name.

## 7. How to run the frontend

```bash
cd frontend
npm.cmd run dev
```

Open the shown address (http://localhost:5173). Stop with Ctrl+C.

## 8. How to run the backend

```bash
cd backend
npm.cmd run dev
```

The API listens on http://localhost:5000. Stop with Ctrl+C.

## 9. Checking code quality (lint)

```bash
npm.cmd run lint           # from the root: checks frontend AND backend
```

Run this before asking for any new feature code — it catches mistakes early.

## 10. How to build (make it deploy-ready)

```bash
npm.cmd run build          # from the root: builds backend AND frontend
```

Both must succeed with zero errors. Currently: both pass.

## 11. Security notes (short version)

- Real credentials are NEVER stored in code or Git — only in `.env` files
  that are ignored by Git.
- The frontend may only hold *public* configuration (`VITE_*` variables).
- The API validates its environment at startup and refuses to run with
  missing/invalid settings (fail-fast).
- CORS allows only the configured frontend address; no wildcards.
- Security headers (Helmet), rate limiting, request limits, and a central
  error handler that hides internal details are all active.
- Full details, including what is IMPLEMENTED vs PLANNED:
  `docs/security-baseline.md`.

## 12. Development workflow (how we will work)

1. Everything is written into the repository; Git keeps the history.
2. Each phase has clear checkpoints and must build + lint cleanly before
   moving on.
3. Business features are added phase by phase; Phase 1 intentionally stops
   before any business logic.

## 13. Root convenience commands

| Command | Does what |
|---------|-----------|
| `npm.cmd run setup` | Install both apps' dependencies |
| `npm.cmd run dev:backend` | Start the API |
| `npm.cmd run dev:frontend` | Start the web UI |
| `npm.cmd run lint` | Lint both apps |
| `npm.cmd run build` | Build both apps (Phase 1 exit criterion) |
