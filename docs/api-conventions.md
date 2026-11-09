# API Conventions

## Base URL & versioning

```
http://localhost:5000/api/v1/<resource>
```

All endpoints are versioned. Breaking changes produce `/api/v2/...`, never a
silent change to v1.

## Response envelope (mandatory)

Success:

```json
{
  "success": true,
  "data": {},
  "message": "Operation successful"
}
```

Failure (never contains stack traces, SQL, or internal details):

```json
{
  "success": false,
  "message": "Something went wrong",
  "code": "INTERNAL_ERROR",
  "requestId": "req_abc123"
}
```

## Current endpoints (Phase 1)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/v1/health` | public | Liveness probe |
| GET | `/api/v1/health/db` | internal* | Database readiness (`up`/`down` only) |

\* will require authentication once it exists.

### Example

```bash
curl http://localhost:5000/api/v1/health
# {"success":true,"data":{"status":"healthy"},"message":"API is healthy"}
```

## Error codes

| Code | Meaning |
|------|---------|
| VALIDATION_ERROR | Request data failed validation (400) |
| UNAUTHORIZED | No/invalid session (401, Phase 2) |
| FORBIDDEN | Authenticated but not allowed (403, Phase 2) |
| NOT_FOUND | Unknown route/resource (404) |
| RATE_LIMITED | Too many requests (429) |
| SERVICE_UNAVAILABLE | Dependency (e.g. DB) down (503) |
| NOT_IMPLEMENTED | Reserved placeholder route (501) |
| INTERNAL_ERROR | Unexpected failure — generic on purpose (500) |

## Rules for every future endpoint

1. Validate body/query/params with Zod middleware — before any logic.
2. Return responses through `sendSuccess` / central error handler only.
3. Apply the stricter `authLimiter` to any authentication route.
4. Never log or return passwords, tokens, cookies, or database details.
5. Every mutating endpoint will require authentication + authorization
   checks (middleware, not inline code).
6. Request tracing: rely on `X-Request-Id` propagation; include it in logs.
