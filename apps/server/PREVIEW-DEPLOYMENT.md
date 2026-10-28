# Private Heard workspace server preview

This is a deployment recipe for the disabled Heard foundation in PR #1. It
contains no account exchange route and is **not** the Kitchen chat cutover. Use
an empty, isolated database and do not point the Heard app or the Colanode web
preview at this server until the identity, permission, and mobile gates pass.

## Runtime

- Build from the repository root with `Dockerfile.preview`. The root
  `.dockerignore` excludes local dependencies, build output, and environment
  files. The image builds only `core`, `crdt`, and `server` from the reviewed
  source and starts the Fastify server on port `3000`.
- Provide PostgreSQL 17 **with pgvector**, Redis/Valkey, and a persistent volume
  mounted at `/data`. The preview config uses private file storage on that
  volume; it does not grant public file access or implement the final file
  quota, export, or retention policy.
- Set `POSTGRES_URL`, `REDIS_URL`, and `COLANODE_WEB_ORIGIN` as service variables.
  The last value is one exact HTTPS origin, such as a protected web preview.
  `NODE_ENV`, `CONFIG`, and `PORT` are set in the image. Do not put connection
  strings or credentials in this repository or PR text.
- Run **one server replica**. Startup runs Colanode's database migrations and
  starts Redis-backed jobs. Apply only to an empty preview database until the
  migration and backup process has been reviewed.

## Host setup

On Railway, create an isolated project with a pgvector-capable PostgreSQL
service (the standard PostgreSQL template does not include pgvector), a
Redis/Valkey service, and a volume for `/data`. Deploy this branch using the
root `Dockerfile.preview` and set the three variables above from private
service references. Leave the server without a public domain.

If Railway account creation is unavailable, Render can use its PostgreSQL
`pgvector` extension, Key Value service, private service, and persistent disk
with the same image and config. The optional root `render.yaml` describes one
private service, one database, one Key Value instance, and a 5 GB disk in Ohio.
It has no public domain and disables automatic deploys. On Render's published
October 2026 rates, those selected plans total about **US$55.25/month** before
bandwidth, extra database storage, workspace fees, and tax: US$25 for the
server, US$19 for PostgreSQL, US$10 for Key Value, and US$1.25 for the disk.
The Blueprint is not applied by this PR; review the exact price before syncing
it. A public domain and browser connection are separate, later rollout steps.

## Verification before a browser connection

1. Confirm PostgreSQL has the `vector` extension available and that the
   Colanode migrator completes against the empty database.
2. Confirm the server starts after Redis connects, and request `/` and
   `/config` over the host's private network. Record the deployment commit and
   logs without copying secrets into an issue or PR.
3. Restart the service and confirm the `/data` volume persists; test backup
   and restore before allowing real user data.
4. Keep the public domain absent. PRs #3 and later must pass human auth and
   migration review, container-backed tests, managed-workspace restrictions,
   and revocation checks before sign-in is enabled.

The fork retains Colanode's Apache-2.0 license. This deployment recipe is a
Heard-specific addition, not an upstream Colanode configuration.
