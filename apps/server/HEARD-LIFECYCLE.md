# Private Heard member lifecycle draft

The lifecycle ingress is **unmounted by default**. It is registered only when
both `heard.enabled` and `heard.lifecycle.enabled` are true in the server
configuration. No current deployment enables it. The public identity exchange
and Heard sender remain disabled.

## Wire contract

`POST /v1/internal/heard/member-events` over private HTTPS with
`Authorization: Bearer <dedicated lifecycle credential>`. The credential is
separate from the Colanode-to-Heard backchannel credential and must be supplied
with an `env://` or `file://` config reference.

The JSON body contains these typed fields (unknown fields are ignored):

| Field | Type |
| --- | --- |
| `eventId` | UUID; durable outbox event identity |
| `organizationId` | Heard organization UUID |
| `heardUserId` | Heard user UUID |
| `memberVersion` | Positive canonical decimal string, at most signed Postgres bigint |
| `action` | `revoke` or `reconcile` |
| `occurredAt` | ISO timestamp with offset, at most 40 characters |

Heard's member version must increase atomically for every membership state
transition. JSON numbers and timestamps are not ordering keys. The server
reserves the event ID/version in a ledger, serializes actions per Heard user,
and advances the high-water mark only after provisioning or revocation succeeds.

Responses:

| Status | Body | Sender action |
| --- | --- | --- |
| 200 | `{ "status": "applied" }` | Settle the event |
| 200 | `{ "status": "duplicate" }` | Settle an exact replay |
| 200 | `{ "status": "stale" }` | Settle a lower version |
| 400/401 | Error code | Stop and alert; fix payload or credential |
| 409 | `{ "code": "lifecycle_conflict" }` | Stop and alert; event ID/version or org identity conflicts |
| 503 | `{ "code": "lifecycle_unavailable" }` | Retry with backoff |

A duplicate `eventId` with a changed tuple or the same member/version with a
different event ID is a 409. A Heard user moving to another organization is
also a 409 until a reviewed transfer protocol is defined.

For `reconcile`, Colanode calls the canonical Heard
`POST /api/collaboration/member/resolve` endpoint with the existing backchannel
credential and `{ organizationId, heardUserId }`. A 200 must contain the exact
current eligible identity schema and matching IDs. Only a 404 JSON response
with `{ "code": "member_ineligible" }` means the current member is ineligible;
that leads to scoped revoke or no-op. A generic/HTML 404, timeout, failed
authentication, malformed response, or network outage returns 503. The event
body never supplies a role, email, or name. A `revoke` uses the authenticated
event's org/user IDs and does not need a canonical lookup.

## Review gates

Migration `00035_create_heard_lifecycle_ledger` has not run on any deployed
database. Human review, backup and a Docker-enabled integration run are
required before enabling the route. The ingress must stay on private networking
with HTTPS and a host-injected credential. Heard delivery must remain off until
both sides, replay handling, and the full chat parity plan pass review.
