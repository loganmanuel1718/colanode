# Heard identity integration foundation

This fork starts at Colanode commit `d649523637f0f059c936418488165d4a689da27c` under Apache-2.0. The changes under `apps/server/src/lib/config/` and `apps/server/src/lib/heard-identity.ts` add a disabled configuration section and a private code-consumption client. **There is no public Heard login endpoint yet.** Setting `heard.enabled` does not enable login.

## Proposed exchange

1. Heard validates its own Supabase session and current organization membership server-side.
2. Heard issues an opaque, high-entropy code valid for at most 60 seconds, bound to that user and org. It stores only a hash and consumes the code atomically once.
3. The browser presents only that code to a future Colanode exchange endpoint. It never supplies authoritative user ID, org ID or role.
4. Colanode calls Heard's `POST /api/collaboration/introspect` over HTTPS with `{ "code": "..." }` and an `Authorization: Bearer` service credential. Heard returns `heardUserId`, `organizationId`, `role` (`admin`, `chef` or `cook`), `email` and `name` only after consuming the code. Invalid, expired, replayed and FOH codes fail closed.
5. Colanode maps that canonical identity to an explicitly provisioned workspace and account. It must not call the current `buildLoginSuccessOutput()` until its automatic personal-workspace creation is separated from issuing a device token.

The helper `consumeHeardIdentityCode()` implements step 4's outbound call and strict response parsing. It does not create accounts, workspaces or devices. A non-2xx backend failure becomes a generic unavailable error; invalid codes return null. It never logs the code, response body or service credential. The service credential is referenced with `env://` or `file://` in server config, never committed as a literal.

## Gates before exposing a route

- **Canonical mapping:** one Heard organization maps to exactly one Colanode workspace, with stable user IDs and role translation; all writes are idempotent. Colanode's default personal-workspace creation must not run for Heard users.
- **Revocation:** Colanode's device tokens are currently persistent. On Heard user removal, org transfer, role change to FOH, logout-all or suspension, all relevant devices and workspace membership must be revoked promptly. The exchange route cannot ship with a one-time access check but no ongoing revocation.
- **Tenant and role tests:** prove that two organizations cannot read each other's nodes/files, and that a revoked or FOH account cannot use REST, WebSocket or file upload/download with an old token.
- **Deployment:** use a persistent host for Fastify/WebSockets plus Postgres with pgvector, Redis and private object storage. Keep the server private until the auth gates above pass. The upstream Docker Compose is for local development and has example credentials; do not use it unmodified in a public preview.
- **Human review:** auth, workspace membership and storage are Tier 3 changes in Heard's shipping rules. A human reviews every changed line and a separate security review verifies the route before enabling it.

Focused parser and back-channel tests run with `npm run test:unit -w @colanode/server` without Docker. Full server tests need Testcontainers with Postgres and Redis.
