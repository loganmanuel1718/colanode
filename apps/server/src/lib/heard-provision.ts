import { sql } from 'kysely';

import {
  AccountStatus,
  generateId,
  IdType,
  UserStatus,
  WorkspaceStatus,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { config } from '@colanode/server/lib/config';
import { eventBus } from '@colanode/server/lib/event-bus';
import type { HeardIdentity } from '@colanode/server/lib/heard-identity';
import {
  ensureKitchenChannel,
  syncKitchenMemberRole,
} from '@colanode/server/lib/heard-kitchen';
import { heardWorkspaceRole } from '@colanode/server/lib/heard-mapping-policy';
import {
  HeardMappingConflict,
  reconcileHeardMember,
} from '@colanode/server/lib/heard-mappings';

export interface HeardProvisionResult {
  accountId: string;
  userId: string;
  workspaceId: string;
}

/**
 * Accept only a canonical identity returned by consumeHeardIdentityCode.
 * This is a server-only service; no public route invokes it.
 */
export const provisionHeardIdentity = async (
  verifiedIdentity: HeardIdentity
): Promise<HeardProvisionResult> => {
  const identity = {
    ...verifiedIdentity,
    email: verifiedIdentity.email.trim().toLowerCase(),
  };

  const provisioned = await database.transaction().execute(async (trx) => {
    const existingMember = await trx
      .selectFrom('heard_member_mappings')
      .select(['heard_organization_id', 'account_id', 'user_id'])
      .where('heard_user_id', '=', identity.heardUserId)
      .executeTakeFirst();
    const organization = await trx
      .selectFrom('heard_workspace_mappings')
      .select('workspace_id')
      .where('heard_organization_id', '=', identity.organizationId)
      .executeTakeFirst();

    if (existingMember) {
      if (
        existingMember.heard_organization_id !== identity.organizationId ||
        !organization
      ) {
        throw new HeardMappingConflict();
      }
      const account = await trx
        .selectFrom('accounts')
        .select(['id', 'email', 'name', 'password', 'attributes'])
        .where('id', '=', existingMember.account_id)
        .executeTakeFirst();
      const user = await trx
        .selectFrom('users')
        .select(['id', 'workspace_id', 'account_id'])
        .where('id', '=', existingMember.user_id)
        .executeTakeFirst();
      const otherMembership = await trx
        .selectFrom('users')
        .select('id')
        .where('account_id', '=', existingMember.account_id)
        .where('id', '!=', existingMember.user_id)
        .executeTakeFirst();
      if (
        !account ||
        account.password !== null ||
        account.attributes !== null ||
        !user ||
        user.workspace_id !== organization.workspace_id ||
        user.account_id !== account.id ||
        otherMembership
      ) {
        throw new HeardMappingConflict();
      }
      if (account.email !== identity.email || account.name !== identity.name) {
        const emailOwner = await trx
          .selectFrom('accounts')
          .select('id')
          .where(sql<string>`lower(email)`, '=', identity.email)
          .executeTakeFirst();
        if (emailOwner && emailOwner.id !== account.id) {
          throw new HeardMappingConflict();
        }
        await trx
          .updateTable('accounts')
          .set({
            email: identity.email,
            name: identity.name,
            updated_at: new Date(),
          })
          .where('id', '=', account.id)
          .execute();
      }
      return {
        accountId: account.id,
        userId: user.id,
        workspaceId: organization.workspace_id,
        createdWorkspace: false,
        createdUser: false,
      };
    }

    const emailOwner = await trx
      .selectFrom('accounts')
      .select('id')
      .where(sql<string>`lower(email)`, '=', identity.email)
      .executeTakeFirst();
    if (emailOwner) {
      // Never attach a Heard identity to a pre-existing native account by email.
      throw new HeardMappingConflict();
    }

    const now = new Date();
    const accountId = generateId(IdType.Account);
    const userId = generateId(IdType.User);
    await trx
      .insertInto('accounts')
      .values({
        id: accountId,
        name: identity.name,
        email: identity.email,
        avatar: null,
        password: null,
        attributes: null,
        created_at: now,
        status: AccountStatus.Active,
      })
      .execute();

    let workspaceId = organization?.workspace_id;
    if (!workspaceId) {
      workspaceId = generateId(IdType.Workspace);
      await trx
        .insertInto('workspaces')
        .values({
          id: workspaceId,
          name: 'Heard Team',
          description: 'Team collaboration',
          avatar: null,
          created_at: now,
          created_by: accountId,
          status: WorkspaceStatus.Active,
          max_file_size: config.workspace.maxFileSize,
        })
        .execute();
      await trx
        .insertInto('heard_workspace_mappings')
        .values({
          heard_organization_id: identity.organizationId,
          workspace_id: workspaceId,
          created_at: now,
        })
        .execute();
    }

    await trx
      .insertInto('users')
      .values({
        id: userId,
        account_id: accountId,
        workspace_id: workspaceId,
        role: heardWorkspaceRole(identity.role),
        name: identity.name,
        email: identity.email,
        avatar: null,
        created_at: now,
        created_by: accountId,
        status: UserStatus.Active,
        max_file_size: '0',
        storage_limit: '0',
      })
      .execute();
    await trx
      .insertInto('heard_member_mappings')
      .values({
        heard_user_id: identity.heardUserId,
        heard_organization_id: identity.organizationId,
        account_id: accountId,
        user_id: userId,
        created_at: now,
        revoked_at: null,
      })
      .execute();

    return {
      accountId,
      userId,
      workspaceId,
      createdWorkspace: organization === undefined,
      createdUser: true,
    };
  });

  await reconcileHeardMember(
    identity,
    provisioned.accountId,
    provisioned.userId
  );
  const kitchen = await ensureKitchenChannel(
    identity.organizationId,
    provisioned.workspaceId,
    provisioned.userId
  );
  await syncKitchenMemberRole(
    kitchen,
    provisioned.workspaceId,
    provisioned.userId,
    heardWorkspaceRole(identity.role)
  );
  if (provisioned.createdWorkspace) {
    eventBus.publish({
      type: 'workspace.created',
      workspaceId: provisioned.workspaceId,
    });
  }
  if (provisioned.createdUser) {
    eventBus.publish({
      type: 'user.created',
      userId: provisioned.userId,
      accountId: provisioned.accountId,
      workspaceId: provisioned.workspaceId,
    });
  }
  return {
    accountId: provisioned.accountId,
    userId: provisioned.userId,
    workspaceId: provisioned.workspaceId,
  };
};
