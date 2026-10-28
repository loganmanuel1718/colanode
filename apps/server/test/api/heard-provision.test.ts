import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ApiErrorCode,
  generateId,
  IdType,
  MutationStatus,
  UserStatus,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { generatePasswordHash } from '@colanode/server/lib/accounts';
import type { HeardIdentity } from '@colanode/server/lib/heard-identity';
import {
  HeardMappingConflict,
  revokeHeardMember,
} from '@colanode/server/lib/heard-mappings';
import { provisionHeardIdentity } from '@colanode/server/lib/heard-provision';
import { fetchOtp, saveOtp } from '@colanode/server/lib/otps';

import { buildTestApp } from '../helpers/app';
import {
  buildAuthHeader,
  createAccount,
  createDevice,
  createUser,
  createWorkspace,
} from '../helpers/seed';

const app = buildTestApp();

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const identity = (
  organizationId: string,
  role: HeardIdentity['role']
): HeardIdentity => ({
  heardUserId: randomUUID(),
  organizationId,
  role,
  email: `heard-${randomUUID()}@example.com`,
  name: 'Heard Member',
});

describe('dedicated Heard provisioning', () => {
  it('creates one workspace per organization, dedicated accounts, and idempotent members', async () => {
    const organizationId = randomUUID();
    const first = identity(organizationId, 'admin');
    const firstResult = await provisionHeardIdentity(first);
    expect(await provisionHeardIdentity(first)).toEqual(firstResult);

    const second = identity(organizationId, 'cook');
    const secondResult = await provisionHeardIdentity(second);
    expect(secondResult.workspaceId).toBe(firstResult.workspaceId);
    expect(secondResult.accountId).not.toBe(firstResult.accountId);

    const account = await database
      .selectFrom('accounts')
      .select(['email', 'password', 'attributes'])
      .where('id', '=', firstResult.accountId)
      .executeTakeFirstOrThrow();
    expect(account).toEqual({
      email: first.email,
      password: null,
      attributes: null,
    });
    const member = await database
      .selectFrom('users')
      .select(['role', 'status', 'workspace_id'])
      .where('id', '=', secondResult.userId)
      .executeTakeFirstOrThrow();
    expect(member).toMatchObject({
      role: 'collaborator',
      status: UserStatus.Active,
      workspace_id: firstResult.workspaceId,
    });
    expect(
      await database
        .selectFrom('heard_workspace_mappings')
        .select('workspace_id')
        .where('heard_organization_id', '=', organizationId)
        .execute()
    ).toHaveLength(1);
    const kitchenMapping = await database
      .selectFrom('heard_workspace_mappings')
      .select(['kitchen_space_id', 'kitchen_channel_id'])
      .where('heard_organization_id', '=', organizationId)
      .executeTakeFirstOrThrow();
    expect(kitchenMapping.kitchen_space_id).toBeTruthy();
    expect(kitchenMapping.kitchen_channel_id).toBeTruthy();
    expect(
      await database
        .selectFrom('nodes')
        .select(['type', 'parent_id', 'attributes'])
        .where('id', '=', kitchenMapping.kitchen_channel_id!)
        .executeTakeFirstOrThrow()
    ).toMatchObject({
      type: 'channel',
      parent_id: kitchenMapping.kitchen_space_id,
      attributes: { name: 'Kitchen' },
    });
    expect(
      (
        await database
          .selectFrom('nodes')
          .select('attributes')
          .where('id', '=', kitchenMapping.kitchen_space_id!)
          .executeTakeFirstOrThrow()
      ).attributes
    ).toMatchObject({
      collaborators: { [secondResult.userId]: 'collaborator' },
    });
    expect(
      await database
        .selectFrom('heard_member_mappings')
        .select('heard_user_id')
        .where('heard_organization_id', '=', organizationId)
        .execute()
    ).toHaveLength(2);

    await provisionHeardIdentity({
      ...first,
      role: 'cook',
      name: 'Updated Member',
    });
    const downgraded = await database
      .selectFrom('users')
      .select(['role', 'name'])
      .where('id', '=', firstResult.userId)
      .executeTakeFirstOrThrow();
    expect(downgraded).toEqual({
      role: 'collaborator',
      name: 'Updated Member',
    });
    expect(
      (
        await database
          .selectFrom('nodes')
          .select('attributes')
          .where('id', '=', kitchenMapping.kitchen_space_id!)
          .executeTakeFirstOrThrow()
      ).attributes
    ).toMatchObject({
      collaborators: { [firstResult.userId]: 'collaborator' },
    });
    expect(
      await database
        .selectFrom('heard_workspace_mappings')
        .select(['kitchen_space_id', 'kitchen_channel_id'])
        .where('heard_organization_id', '=', organizationId)
        .executeTakeFirstOrThrow()
    ).toEqual(kitchenMapping);
    await expect(
      provisionHeardIdentity({ ...first, organizationId: randomUUID() })
    ).rejects.toBeInstanceOf(HeardMappingConflict);

    await revokeHeardMember(organizationId, second.heardUserId);
    const revokedSpace = await database
      .selectFrom('nodes')
      .select('attributes')
      .where('id', '=', kitchenMapping.kitchen_space_id!)
      .executeTakeFirstOrThrow();
    expect(revokedSpace.attributes.type).toBe('space');
    if (revokedSpace.attributes.type === 'space') {
      expect(
        revokedSpace.attributes.collaborators[secondResult.userId]
      ).toBeUndefined();
    }
    expect(await provisionHeardIdentity(second)).toEqual(secondResult);
    const restoredSpace = await database
      .selectFrom('nodes')
      .select('attributes')
      .where('id', '=', kitchenMapping.kitchen_space_id!)
      .executeTakeFirstOrThrow();
    expect(restoredSpace.attributes).toMatchObject({
      collaborators: { [secondResult.userId]: 'collaborator' },
    });
  });

  it('never claims a native account from a matching email', async () => {
    const candidate = identity(randomUUID(), 'admin');
    const native = await createAccount({ email: candidate.email });
    await expect(provisionHeardIdentity(candidate)).rejects.toBeInstanceOf(
      HeardMappingConflict
    );
    expect(
      await database
        .selectFrom('heard_member_mappings')
        .select('account_id')
        .where('account_id', '=', native.id)
        .executeTakeFirst()
    ).toBeUndefined();
    expect(
      await database
        .selectFrom('heard_workspace_mappings')
        .select('workspace_id')
        .where('heard_organization_id', '=', candidate.organizationId)
        .executeTakeFirst()
    ).toBeUndefined();
  });
});

describe('managed account and workspace route guards', () => {
  it('denies a native account even if it has a legacy membership in a managed workspace', async () => {
    const managed = await provisionHeardIdentity(
      identity(randomUUID(), 'admin')
    );
    const native = await createAccount({ password: 'Password123!' });
    await createUser({
      workspaceId: managed.workspaceId,
      account: native,
      role: 'admin',
    });
    const { token } = await createDevice({ accountId: native.id });

    const workspaceResponse = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${managed.workspaceId}`,
      headers: buildAuthHeader(token),
    });
    expect(workspaceResponse.statusCode).toBe(403);
    expect(workspaceResponse.json()).toMatchObject({
      code: ApiErrorCode.WorkspaceNoAccess,
    });

    const sync = await app.inject({
      method: 'POST',
      url: '/client/v1/accounts/sync',
      headers: buildAuthHeader(token),
    });
    expect(sync.statusCode).toBe(200);
    expect(sync.json().workspaces).toEqual([]);

    const nativeLogin = await app.inject({
      method: 'POST',
      url: '/client/v1/auth/email/login',
      payload: { email: native.email, password: 'Password123!' },
    });
    expect(nativeLogin.statusCode).toBe(200);
    expect(
      nativeLogin
        .json()
        .workspaces.every(
          (workspace: { id: string }) => workspace.id !== managed.workspaceId
        )
    ).toBe(true);
  });

  it('blocks native login, member escalation, invites, workspace changes, and cross-org access', async () => {
    const organizationId = randomUUID();
    const admin = identity(organizationId, 'admin');
    const cook = identity(organizationId, 'cook');
    const adminResult = await provisionHeardIdentity(admin);
    const cookResult = await provisionHeardIdentity(cook);
    const kitchen = await database
      .selectFrom('heard_workspace_mappings')
      .select(['kitchen_space_id', 'kitchen_channel_id'])
      .where('heard_organization_id', '=', organizationId)
      .executeTakeFirstOrThrow();
    const { token } = await createDevice({ accountId: adminResult.accountId });
    const headers = buildAuthHeader(token);

    // Even a password added outside the bridge cannot enable native login.
    await database
      .updateTable('accounts')
      .set({ password: await generatePasswordHash('Password123!') })
      .where('id', '=', adminResult.accountId)
      .execute();
    const nativeLogin = await app.inject({
      method: 'POST',
      url: '/client/v1/auth/email/login',
      payload: { email: admin.email, password: 'Password123!' },
    });
    expect(nativeLogin.statusCode).toBe(400);
    expect(nativeLogin.json()).toMatchObject({
      code: ApiErrorCode.EmailOrPasswordIncorrect,
    });
    const registration = await app.inject({
      method: 'POST',
      url: '/client/v1/auth/email/register',
      payload: { name: 'Other', email: admin.email, password: 'Password123!' },
    });
    expect(registration.statusCode).toBe(400);
    const resetInit = await app.inject({
      method: 'POST',
      url: '/client/v1/auth/email/password-reset/init',
      payload: { email: admin.email },
    });
    expect(resetInit.statusCode).toBe(200);
    expect(await fetchOtp(resetInit.json().id)).toBeNull();
    const resetId = generateId(IdType.OtpCode);
    await saveOtp(resetId, {
      id: resetId,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      otp: '123456',
      attributes: { accountId: adminResult.accountId, attempts: 0 },
    });
    const resetComplete = await app.inject({
      method: 'POST',
      url: '/client/v1/auth/email/password-reset/complete',
      payload: { id: resetId, otp: '123456', password: 'NewPassword123!' },
    });
    expect(resetComplete.statusCode).toBe(400);
    expect(resetComplete.json()).toMatchObject({
      code: ApiErrorCode.AccountOtpInvalid,
    });
    const verifyId = generateId(IdType.OtpCode);
    await saveOtp(verifyId, {
      id: verifyId,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      otp: '654321',
      attributes: { accountId: adminResult.accountId, attempts: 0 },
    });
    const emailVerify = await app.inject({
      method: 'POST',
      url: '/client/v1/auth/email/verify',
      payload: { id: verifyId, otp: '654321' },
    });
    expect(emailVerify.statusCode).toBe(400);
    expect(emailVerify.json()).toMatchObject({
      code: ApiErrorCode.AccountOtpInvalid,
    });

    const attempts = [
      {
        method: 'POST' as const,
        url: '/client/v1/workspaces',
        payload: { name: 'Other' },
        code: ApiErrorCode.WorkspaceNoAccess,
      },
      {
        method: 'POST' as const,
        url: `/client/v1/workspaces/${adminResult.workspaceId}/users`,
        payload: {
          users: [
            { email: `other-${randomUUID()}@example.com`, role: 'admin' },
          ],
        },
        code: ApiErrorCode.UserInviteNoAccess,
      },
      {
        method: 'PATCH' as const,
        url: `/client/v1/workspaces/${adminResult.workspaceId}/users/${cookResult.userId}/role`,
        payload: { role: 'admin' },
        code: ApiErrorCode.UserUpdateNoAccess,
      },
      {
        method: 'PATCH' as const,
        url: `/client/v1/workspaces/${adminResult.workspaceId}`,
        payload: { name: 'Hijacked', description: null, avatar: null },
        code: ApiErrorCode.WorkspaceUpdateNotAllowed,
      },
      {
        method: 'DELETE' as const,
        url: `/client/v1/workspaces/${adminResult.workspaceId}`,
        code: ApiErrorCode.WorkspaceDeleteNotAllowed,
      },
      {
        method: 'PATCH' as const,
        url: '/client/v1/accounts/me',
        payload: { name: 'Hijacked', avatar: null },
        code: ApiErrorCode.Forbidden,
      },
    ];
    for (const attempt of attempts) {
      const response = await app.inject({ ...attempt, headers });
      expect(response.statusCode, `${attempt.method} ${attempt.url}`).toBe(403);
      expect(response.json()).toMatchObject({ code: attempt.code });
    }
    expect(
      (
        await database
          .selectFrom('users')
          .select('role')
          .where('id', '=', cookResult.userId)
          .executeTakeFirstOrThrow()
      ).role
    ).toBe('collaborator');

    for (const nodeId of [
      kitchen.kitchen_channel_id!,
      kitchen.kitchen_space_id!,
    ]) {
      for (const mutationType of ['node.update', 'node.delete'] as const) {
        const response = await app.inject({
          method: 'POST',
          url: `/client/v1/workspaces/${adminResult.workspaceId}/mutations`,
          headers,
          payload: {
            mutations: [
              {
                id: generateId(IdType.Mutation),
                createdAt: new Date().toISOString(),
                type: mutationType,
                data:
                  mutationType === 'node.delete'
                    ? {
                        nodeId,
                        rootId: kitchen.kitchen_space_id!,
                        deletedAt: new Date().toISOString(),
                      }
                    : {
                        nodeId,
                        updateId: generateId(IdType.Update),
                        data: 'invalid-update',
                        createdAt: new Date().toISOString(),
                      },
              },
            ],
          },
        });
        expect(response.statusCode).toBe(200);
        expect(response.json().results[0].status).toBe(
          MutationStatus.FORBIDDEN
        );
      }
    }

    const otherWorkspace = await createWorkspace({
      createdBy: adminResult.accountId,
    });
    await createUser({
      workspaceId: otherWorkspace.id,
      account: await database
        .selectFrom('accounts')
        .selectAll()
        .where('id', '=', adminResult.accountId)
        .executeTakeFirstOrThrow(),
      role: 'admin',
    });
    const crossOrg = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${otherWorkspace.id}`,
      headers,
    });
    expect(crossOrg.statusCode).toBe(403);
    expect(crossOrg.json()).toMatchObject({
      code: ApiErrorCode.WorkspaceNoAccess,
    });

    const sync = await app.inject({
      method: 'POST',
      url: '/client/v1/accounts/sync',
      headers,
    });
    expect(sync.statusCode).toBe(200);
    expect(
      sync.json().workspaces.map((workspace: { id: string }) => workspace.id)
    ).toEqual([adminResult.workspaceId]);
  });

  it('prevents inviting a managed account into an unmanaged workspace', async () => {
    const member = identity(randomUUID(), 'cook');
    const managed = await provisionHeardIdentity(member);
    const nativeAccount = await createAccount();
    const nativeWorkspace = await createWorkspace({
      createdBy: nativeAccount.id,
    });
    await createUser({
      workspaceId: nativeWorkspace.id,
      account: nativeAccount,
      role: 'owner',
    });
    const { token } = await createDevice({ accountId: nativeAccount.id });
    const response = await app.inject({
      method: 'POST',
      url: `/client/v1/workspaces/${nativeWorkspace.id}/users`,
      headers: buildAuthHeader(token),
      payload: { users: [{ email: member.email, role: 'admin' }] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().errors).toHaveLength(1);
    expect(
      await database
        .selectFrom('users')
        .select('id')
        .where('account_id', '=', managed.accountId)
        .where('workspace_id', '=', nativeWorkspace.id)
        .executeTakeFirst()
    ).toBeUndefined();
  });
});
