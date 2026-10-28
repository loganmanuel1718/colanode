# Heard identity bridge: server-only draft

This branch extends the disabled identity backchannel from PR #1. It adds no
HTTP route, no account provisioning, and no client sign-in path. The existing
Colanode routes and Heard group chat continue to work as before for unmapped
accounts.

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

## Required before enabling

1. Review every auth and migration line. This branch changes token validation
   and adds migration `00033`; the migration has not been applied to any
   deployed database. Colanode runs migrations at server startup, so a future
   deployment must have a database backup and migration sequencing review.
2. Provision dedicated Colanode accounts and memberships from verified Heard
   identities. The current reconciliation service accepts existing IDs from
   trusted server code only. Never accept account or membership IDs from a
   browser. Do not bind a shared or password-based Colanode account.
3. Wire Heard organization and role changes, removal, and account disablement
   to prompt, authenticated revocation/reconciliation. A successful one-time
   code alone cannot provide continuous revocation. Define retry, replay and
   outage behavior before issuing a persistent Colanode device token.
4. Restrict native Colanode login, invitations, role changes and workspace
   creation for Heard-managed accounts/workspaces. Otherwise someone could
   obtain or elevate access outside Heard. Keep the public exchange disabled
   until these controls and end-to-end tests pass.
5. Set up a persistent host with PostgreSQL plus pgvector, Redis, object
   storage, HTTPS, secret injection, backups and WebSocket routing. No server
   has been deployed by this branch.

The integration tests require the repository's Testcontainers PostgreSQL and
Redis setup. They run with `npm run test -w @colanode/server`; the focused
unit tests run without containers using `npm run test:unit -w @colanode/server`.
