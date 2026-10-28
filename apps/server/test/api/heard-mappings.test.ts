import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { UserStatus } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { HeardIdentity } from '@colanode/server/lib/heard-identity';
import {
  bindHeardOrganization,
  HeardMappingConflict,
  isHeardAccountActive,
  reconcileHeardMember,
  resolveHeardWorkspace,
  revokeHeardMember,
} from '@colanode/server/lib/heard-mappings';
import { parseToken, verifyToken } from '@colanode/server/lib/tokens';

import {
  createAccount,
  createDevice,
  createUser,
  createWorkspace,
} from '../helpers/seed';

const identity = (
  organizationId: string,
  role: HeardIdentity['role'] = 'admin'
): HeardIdentity => ({
  heardUserId: randomUUID(),
  organizationId,
  role,
  email: `heard-${randomUUID()}@example.com`,
  name: 'Heard Member',
});

describe('Heard organization and member mappings', () => {
  it('accepts an identical organization binding and rejects both duplicate directions', async () => {
    const account = await createAccount();
    const first = await createWorkspace({ createdBy: account.id });
    const second = await createWorkspace({ createdBy: account.id });
    const firstOrg = randomUUID();
    const secondOrg = randomUUID();

    await bindHeardOrganization(firstOrg, first.id);
    await bindHeardOrganization(firstOrg, first.id);
    await expect(
      bindHeardOrganization(firstOrg, second.id)
    ).rejects.toBeInstanceOf(HeardMappingConflict);
    await expect(
      bindHeardOrganization(secondOrg, first.id)
    ).rejects.toBeInstanceOf(HeardMappingConflict);
    expect(await resolveHeardWorkspace(firstOrg, first.id)).toBe(first.id);
    expect(await resolveHeardWorkspace(secondOrg, first.id)).toBeNull();
    expect(await resolveHeardWorkspace(firstOrg, second.id)).toBeNull();
  });

  it('rejects cross-organization and duplicate user/account bindings', async () => {
    const account = await createAccount();
    const otherAccount = await createAccount();
    const first = await createWorkspace({ createdBy: account.id });
    const second = await createWorkspace({ createdBy: otherAccount.id });
    const firstOrg = randomUUID();
    const secondOrg = randomUUID();
    await bindHeardOrganization(firstOrg, first.id);
    await bindHeardOrganization(secondOrg, second.id);
    const user = await createUser({
      workspaceId: first.id,
      account,
      role: 'collaborator',
    });
    const otherUser = await createUser({
      workspaceId: second.id,
      account: otherAccount,
      role: 'collaborator',
    });
    const member = identity(firstOrg);

    await expect(
      reconcileHeardMember(member, otherAccount.id, otherUser.id)
    ).rejects.toBeInstanceOf(HeardMappingConflict);
    await reconcileHeardMember(member, account.id, user.id);
    await expect(
      reconcileHeardMember(member, otherAccount.id, otherUser.id)
    ).rejects.toBeInstanceOf(HeardMappingConflict);
    await expect(
      reconcileHeardMember(identity(firstOrg), account.id, user.id)
    ).rejects.toBeInstanceOf(HeardMappingConflict);
  });

  it('reconciles roles idempotently and invalidates revoked devices', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const organizationId = randomUUID();
    await bindHeardOrganization(organizationId, workspace.id);
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'admin',
    });
    const member = identity(organizationId);
    const { device, token } = await createDevice({ accountId: account.id });
    const tokenData = parseToken(token);
    expect(tokenData).not.toBeNull();

    await reconcileHeardMember(member, account.id, user.id);
    const initialRevision = await database
      .selectFrom('users')
      .select('revision')
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();
    await reconcileHeardMember(member, account.id, user.id);
    expect(
      await database
        .selectFrom('heard_member_mappings')
        .selectAll()
        .where('heard_user_id', '=', member.heardUserId)
        .execute()
    ).toHaveLength(1);
    expect(
      await database
        .selectFrom('users')
        .select('revision')
        .where('id', '=', user.id)
        .executeTakeFirstOrThrow()
    ).toEqual(initialRevision);

    await reconcileHeardMember(
      { ...member, role: 'cook' },
      account.id,
      user.id
    );
    expect(
      await database
        .selectFrom('users')
        .select(['role', 'status'])
        .where('id', '=', user.id)
        .executeTakeFirst()
    ).toMatchObject({ role: 'collaborator', status: UserStatus.Active });
    expect(await isHeardAccountActive(account.id)).toBe(true);
    expect((await verifyToken(tokenData!)).authenticated).toBe(true);

    await expect(
      revokeHeardMember(randomUUID(), member.heardUserId)
    ).rejects.toBeInstanceOf(HeardMappingConflict);
    await revokeHeardMember(organizationId, member.heardUserId);
    await revokeHeardMember(organizationId, member.heardUserId);
    expect(await isHeardAccountActive(account.id)).toBe(false);
    expect((await verifyToken(tokenData!)).authenticated).toBe(false);
    expect(
      await database
        .selectFrom('devices')
        .select('id')
        .where('id', '=', device.id)
        .executeTakeFirst()
    ).toBeUndefined();
    expect(
      await database
        .selectFrom('users')
        .select(['role', 'status'])
        .where('id', '=', user.id)
        .executeTakeFirst()
    ).toMatchObject({ role: 'none', status: UserStatus.Removed });

    const laterDevice = await createDevice({ accountId: account.id });
    expect(
      (await verifyToken(parseToken(laterDevice.token)!)).authenticated
    ).toBe(false);

    await reconcileHeardMember(member, account.id, user.id);
    expect(
      (await verifyToken(parseToken(laterDevice.token)!)).authenticated
    ).toBe(false);
    expect(
      await database
        .selectFrom('devices')
        .select('id')
        .where('id', '=', laterDevice.device.id)
        .executeTakeFirst()
    ).toBeUndefined();
  });
});
