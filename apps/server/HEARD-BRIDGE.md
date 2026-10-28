# Heard identity bridge: server-only draft

This branch extends the disabled identity backchannel from PR #1. It adds no
HTTP exchange route or client sign-in path. The existing Heard group chat
remains the live message store; this branch does not import or cut over messages.
Unmapped Colanode accounts retain their existing routes.

## Mapping contract

- One Heard organization UUID maps to one existing Colanode workspace ID.
  The workspace must be active. Duplicate organization or workspace bindings
  fail, while repeating the same binding is safe.
- One Heard user UUID maps to one dedicated Colanode account and one membership
  in the organization's workspace. A different Heard ID cannot claim that
  account or membership. Cross-organization lookup returns no workspace.
- Only the authenticated Heard backchannel response may supply the Heard user,
  organization and role. `admin` maps to workspace `admin`; `chef` and `cook`
  map to `collaborator` so both can use chat. Reconciliation updates a mapped
  member's role and profile. Repeating an unchanged response does not update
  the membership revision.
- Revocation requires both Heard IDs. It marks the mapped membership removed,
  deletes all account device tokens, and publishes device and user events.
  Token verification and socket-ticket redemption check the database again;
  a device created while revoked remains denied and is destroyed on a later
  verified reactivation.
- `provisionHeardIdentity()` creates a new passwordless account, workspace,
  membership and mapping rows in one transaction. A matching email on a native
  account is a conflict, not a way to claim that account. Repeating a verified
  identity returns the same IDs; a second user in the same organization joins
  its existing workspace. The service is internal and requires a canonical
  identity from the Heard backchannel.
- Migration `00034` stores stable Kitchen space/channel IDs on the organization
  mapping. Provisioning creates the public Team space and permanent Kitchen
  channel with those IDs; retries reuse them. Verified member roles are applied
  to the Team space collaboration list so cooks can post. Client mutations
  cannot modify or delete Kitchen or its parent Team space; this also prevents
  collaborator-role escalation through a space attribute update.
- Managed accounts cannot use native email, Google or OTP login or password
  reset, change their local profile, create another workspace, or accept a
  native invitation to another workspace. Managed workspaces reject native
  invites, role updates, rename and deletion. Account sync, workspace routes
  and socket user selection remain scoped to the mapped workspace. A native
  account with a pre-existing membership in a mapped workspace is also denied
  and does not receive that workspace in login or sync output.

## Required before enabling

1. Review every auth and migration line. This branch changes token validation
   and adds migrations `00033` and `00034`; they have not been applied to any
   deployed database. Colanode runs migrations at server startup, so a future
   deployment must have a database backup and migration sequencing review.
2. Mount a reviewed exchange that calls provisioning only with the verified
   backchannel identity. Never accept account, membership or workspace IDs from
   a browser. Review the permanent Kitchen ACL and native-route protections
   with two real accounts and a FOH denial account before enabling sign-in.
3. Wire Heard organization and role changes, removal, and account disablement
   to prompt, authenticated revocation/reconciliation. A successful one-time
   code alone cannot provide continuous revocation. Define retry, replay and
   outage behavior before issuing a persistent Colanode device token.
4. Run the PostgreSQL/Redis integration tests and two-device browser checks.
   The current Kitchen channel is empty by design. Historical Heard messages,
   Roux, notifications, photos and other current chat behavior must pass
   parity and a controlled cutover before users can enter the new channel.
5. Set up a persistent host with PostgreSQL plus pgvector, Redis, object
   storage, HTTPS, secret injection, backups and WebSocket routing. No server
   has been deployed by this branch.

The integration tests require the repository's Testcontainers PostgreSQL and
Redis setup. They run with `npm run test -w @colanode/server`; the focused
unit tests run without containers using `npm run test:unit -w @colanode/server`.
