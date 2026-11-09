# Architecture

## Big picture

```
                 React + TypeScript (frontend/)
                         |
                         | HTTPS, JSON, HTTP-only cookies (planned)
                         v
                Node.js + Express (backend/)
                         |
             +-----------+-----------+
             |                       |
        Security Layer           Business Layer
       security headers          Services
       CORS allowlist            Controllers
       rate limiting             Repositories
       validation                |
             |                   v
             +------------- Prisma (single client)
                                 |
                               MySQL 8.0
```

Rules enforced in Phase 1:

- The browser NEVER talks to MySQL. Only the backend accesses the database.
- No business logic in route files. No database code in controllers.
- One Axios client in the frontend. One Prisma client in the backend. No duplicates.

## Backend layering (request flow)

```
Route  ->  Middleware  ->  Controller  ->  Service  ->  Repository  ->  Prisma  ->  MySQL
```

| Layer | Folder | Responsibility |
|-------|--------|----------------|
| Route | `src/routes/` | URL -> handler wiring only |
| Middleware | `src/middleware/` | Security, validation, auth, rate limit, logging, errors |
| Controller | `src/controllers/` | HTTP in/out, calls services |
| Service | `src/services/` | Business logic |
| Repository | `src/repositories/` | All database access |
| Config | `src/config/` | Validated env, database client, security options |

## Middleware order (implemented in `src/app.ts` + security pipeline):

```
Request
 -> Request ID (X-Request-Id generated/propagated)
 -> Security headers (Helmet)
 -> CORS (origin allowlist only)
 -> Body size limits (express.json/urlencoded)
 -> Cookies parsing (cookie-parser)
 -> Global rate limiting
 -> CSRF origin validation (state-changing requests)
 -> Request logging (structured, no query strings)
 -> Routes (/api/v1)
 -> Validation (per-route, Zod, strict schemas)
 -> Authentication (session cookie -> DB session)
 -> Authorization (requireRole(ADMIN|EXECUTOR))
 -> Controller -> Service -> Repository
 -> Central error handler (envelope: success/error{code,message}/requestId)
```

## Data model (Phase 2)

- `User` (id, name, unique email, passwordHash, Role enum ADMIN|EXECUTOR,
  isActive, lastLoginAt, timestamps) — soft-deactivation only.
- `Session` (userId FK cascade, unique tokenHash SHA-256, expiresAt,
  revokedAt, ip, userAgent) — revocation, expiration, multi-device.
- `AdminExecutorAssignment` (adminId FK Restrict, executorId FK Restrict,
  assignedAt, unassignedAt, isActive) — full history preserved; NO duplicate
  active assignment (row-lock guarded transaction locks the executor row).
- `AuditLog` (userId FK Restrict, action, entityType, entityId, oldValues/new
  Values JSON, ip, userAgent) — append-only; row joins the action's transaction.
- Indexes on: User.role, User.isActive, User.email(unique), Session.tokenHash(unique),
  Session.userId, Session.expiresAt, Assignments (adminId,isActive),
  (executorId,isActive), assignedAt, AuditLog userId/action/entity/createdAt.

## API versioning

All endpoints live under `/api/v1/...`. A breaking future change is released
as `/api/v2/...` so existing clients keep working.

## Database connection

- Prisma client is a **singleton** (`src/config/database.ts`): one instance per
  process, reused across dev hot-reloads via `globalThis`.
- Connection URLs come only from validated environment variables.

## Transaction foundation (Phase requirement #46)

The eventual inventory workflow must be atomic. Example of a future atomic op:

```
Approve request
  -> Issue material
  -> Deduct inventory
  -> Create transaction record
  -> Create notification
  -> Create audit log
```

All of these will be wrapped in a single `prisma.$transaction(async (tx) => { ... })`
inside the relevant **service + repository** pair, so a failure rolls back
everything. The singleton client and repository layering in this phase were set
up specifically to make that possible without rework.

Concurrency: stock deductions will use MySQL row locking
(`SELECT ... FOR UPDATE` via a transaction) or optimistic locking with a version
column — decided in the inventory phase.

## Future security requirements (documented contract for later phases)

### Authentication (Phase 2)
- Login/logout endpoints, secure password hashing (Argon2id preferred,
  bcrypt fallback), session expiration, session invalidation on logout.

### Authorization (Phase 2+)
- Roles: ADMIN, EXECUTOR.
- Admin -> Executor assignment defines *scope*: an Executor only ever acts
  within assignments granted by their Admin.
- API-level checks through `requireRole` middleware; never inline string checks.

### Inventory security (inventory phase)
- Transactional stock updates (see above), concurrency protection, audit logs.

### Application security (continuous)
- Input validation on every endpoint, rate limiting maintained, security
  headers kept, CSRF protection active with cookies, sanitized errors,
  secrets only in env files.

## What is deliberately NOT in Phase 1

No business models, no database schema, no login screens, no dashboard.
Creating the schema before the security and workflow design is settled is the
most common cause of painful rebuilds later — so Phase 1 stops here.
