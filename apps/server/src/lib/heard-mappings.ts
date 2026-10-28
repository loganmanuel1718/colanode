import { UserStatus, WorkspaceStatus } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { eventBus } from '@colanode/server/lib/event-bus';
import { HeardMappingConflict } from '@colanode/server/lib/heard-error';
import { HeardIdentity } from '@colanode/server/lib/heard-identity';
import { removeKitchenMemberRole } from '@colanode/server/lib/heard-kitchen';
import { heardWorkspaceRole } from '@colanode/server/lib/heard-mapping-policy';

export { HeardMappingConflict } from '@colanode/server/lib/heard-error';

/** An administrator binds one existing workspace to exactly one Heard organization. */
export const bindHeardOrganization = async (
  organizationId: string,
  workspaceId: string
): Promise<void> => {
  await database.transaction().execute(async (trx) => {
    const workspace = await trx
      .selectFrom('workspaces')
      .select(['id', 'status'])
      .where('id', '=', workspaceId)
      .executeTakeFirst();
    if (!workspace || workspace.status !== WorkspaceStatus.Active) {
      throw new HeardMappingConflict();
    }

    await trx
      .insertInto('heard_workspace_mappings')
      .values({
        heard_organization_id: organizationId,
        workspace_id: workspaceId,
        created_at: new Date(),
      })
      .onConflict((oc) => oc.doNothing())
      .execute();

    const byOrganization = await trx
      .selectFrom('heard_workspace_mappings')
      .select('workspace_id')
      .where('heard_organization_id', '=', organizationId)
      .executeTakeFirst();
    const byWorkspace = await trx
      .selectFrom('heard_workspace_mappings')
      .select('heard_organization_id')
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirst();
    if (
      byOrganization?.workspace_id !== workspaceId ||
      byWorkspace?.heard_organization_id !== organizationId
    ) {
      throw new HeardMappingConflict();
    }
  });
};

/** Never fall back to a personal workspace or another organization's mapping. */
export const resolveHeardWorkspace = async (
  organizationId: string,
  expectedWorkspaceId?: string
): Promise<string | null> => {
  const mapping = await database
    .selectFrom('heard_workspace_mappings')
    .select('workspace_id')
    .where('heard_organization_id', '=', organizationId)
    .executeTakeFirst();
  if (
    !mapping ||
    (expectedWorkspaceId && mapping.workspace_id !== expectedWorkspaceId)
  ) {
    return null;
  }
  return mapping.workspace_id;
};

export const getHeardWorkspaceForAccount = async (
  accountId: string
): Promise<string | null> => {
  const mapping = await database
    .selectFrom('heard_member_mappings')
    .innerJoin(
      'heard_workspace_mappings',
      'heard_member_mappings.heard_organization_id',
      'heard_workspace_mappings.heard_organization_id'
    )
    .select('heard_workspace_mappings.workspace_id as workspace_id')
    .where('heard_member_mappings.account_id', '=', accountId)
    .executeTakeFirst();
  return mapping?.workspace_id ?? null;
};

export const isHeardAccountManaged = async (
  accountId: string
): Promise<boolean> => (await getHeardWorkspaceForAccount(accountId)) !== null;

export const isHeardWorkspaceManaged = async (
  workspaceId: string
): Promise<boolean> => {
  const mapping = await database
    .selectFrom('heard_workspace_mappings')
    .select('workspace_id')
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  return mapping !== undefined;
};

/**
 * Reconcile a previously verified Heard identity with an existing dedicated
 * Colanode account and membership. No route calls this service yet.
 */
export const reconcileHeardMember = async (
  identity: HeardIdentity,
  accountId: string,
  userId: string
): Promise<void> => {
  const outcome = await database.transaction().execute(async (trx) => {
    const organization = await trx
      .selectFrom('heard_workspace_mappings')
      .select('workspace_id')
      .where('heard_organization_id', '=', identity.organizationId)
      .executeTakeFirst();
    const user = await trx
      .selectFrom('users')
      .select(['id', 'account_id', 'workspace_id'])
      .where('id', '=', userId)
      .executeTakeFirst();
    if (
      !organization ||
      !user ||
      user.account_id !== accountId ||
      user.workspace_id !== organization.workspace_id
    ) {
      throw new HeardMappingConflict();
    }

    let mapping = await trx
      .selectFrom('heard_member_mappings')
      .select(['heard_organization_id', 'account_id', 'user_id', 'revoked_at'])
      .where('heard_user_id', '=', identity.heardUserId)
      .forUpdate()
      .executeTakeFirst();
    if (!mapping) {
      await trx
        .insertInto('heard_member_mappings')
        .values({
          heard_user_id: identity.heardUserId,
          heard_organization_id: identity.organizationId,
          account_id: accountId,
          user_id: userId,
          created_at: new Date(),
          revoked_at: null,
        })
        .onConflict((oc) => oc.doNothing())
        .execute();
      mapping = await trx
        .selectFrom('heard_member_mappings')
        .select([
          'heard_organization_id',
          'account_id',
          'user_id',
          'revoked_at',
        ])
        .where('heard_user_id', '=', identity.heardUserId)
        .forUpdate()
        .executeTakeFirst();
    }
    if (
      mapping?.heard_organization_id !== identity.organizationId ||
      mapping.account_id !== accountId ||
      mapping.user_id !== userId
    ) {
      throw new HeardMappingConflict();
    }

    const lockedUser = await trx
      .selectFrom('users')
      .select(['role', 'status', 'email', 'name'])
      .where('id', '=', userId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    const nextRole = heardWorkspaceRole(identity.role);
    const changed =
      mapping.revoked_at !== null ||
      lockedUser.role !== nextRole ||
      lockedUser.status !== UserStatus.Active ||
      lockedUser.email !== identity.email ||
      lockedUser.name !== identity.name;
    if (!changed) {
      return {
        changed: false,
        workspaceId: organization.workspace_id,
        deviceIds: [],
      };
    }

    const devices = mapping.revoked_at
      ? await trx
          .deleteFrom('devices')
          .where('account_id', '=', accountId)
          .returning('id')
          .execute()
      : [];

    await trx
      .updateTable('users')
      .set({
        role: nextRole,
        status: UserStatus.Active,
        email: identity.email,
        name: identity.name,
        updated_at: new Date(),
      })
      .where('id', '=', userId)
      .execute();
    await trx
      .updateTable('heard_member_mappings')
      .set({ revoked_at: null })
      .where('heard_user_id', '=', identity.heardUserId)
      .execute();
    return {
      changed: true,
      workspaceId: organization.workspace_id,
      deviceIds: devices.map((device) => device.id),
    };
  });

  for (const deviceId of outcome.deviceIds) {
    eventBus.publish({ type: 'device.deleted', deviceId, accountId });
  }
  if (outcome.changed) {
    eventBus.publish({
      type: 'user.updated',
      userId,
      accountId,
      workspaceId: outcome.workspaceId,
    });
  }
};

/** Revocation is scoped to both Heard IDs, and destroys every device token. */
export const revokeHeardMember = async (
  organizationId: string,
  heardUserId: string
): Promise<void> => {
  const outcome = await database.transaction().execute(async (trx) => {
    const mapping = await trx
      .selectFrom('heard_member_mappings')
      .innerJoin(
        'heard_workspace_mappings',
        'heard_member_mappings.heard_organization_id',
        'heard_workspace_mappings.heard_organization_id'
      )
      .select([
        'heard_member_mappings.account_id as account_id',
        'heard_member_mappings.user_id as user_id',
        'heard_member_mappings.revoked_at as revoked_at',
        'heard_workspace_mappings.workspace_id as workspace_id',
        'heard_workspace_mappings.kitchen_space_id as kitchen_space_id',
      ])
      .where('heard_member_mappings.heard_organization_id', '=', organizationId)
      .where('heard_user_id', '=', heardUserId)
      .forUpdate()
      .executeTakeFirst();
    if (!mapping) {
      throw new HeardMappingConflict();
    }
    if (mapping.revoked_at) {
      return { changed: false, ...mapping, deviceIds: [] };
    }

    await trx
      .updateTable('heard_member_mappings')
      .set({ revoked_at: new Date() })
      .where('heard_user_id', '=', heardUserId)
      .execute();
    await trx
      .updateTable('users')
      .set({ role: 'none', status: UserStatus.Removed, updated_at: new Date() })
      .where('id', '=', mapping.user_id)
      .execute();
    const devices = await trx
      .deleteFrom('devices')
      .where('account_id', '=', mapping.account_id)
      .returning('id')
      .execute();
    return {
      changed: true,
      ...mapping,
      deviceIds: devices.map((device) => device.id),
    };
  });

  for (const deviceId of outcome.deviceIds) {
    eventBus.publish({
      type: 'device.deleted',
      deviceId,
      accountId: outcome.account_id,
    });
  }
  if (outcome.changed) {
    eventBus.publish({
      type: 'user.updated',
      userId: outcome.user_id,
      accountId: outcome.account_id,
      workspaceId: outcome.workspace_id,
    });
  }
  if (outcome.kitchen_space_id) {
    await removeKitchenMemberRole(
      outcome.kitchen_space_id,
      outcome.workspace_id,
      outcome.user_id
    );
  }
};

/** Existing Colanode accounts remain unaffected by an unmapped Heard bridge. */
export const isHeardAccountActive = async (
  accountId: string
): Promise<boolean> => {
  const mapping = await database
    .selectFrom('heard_member_mappings')
    .leftJoin('users', 'heard_member_mappings.user_id', 'users.id')
    .select([
      'heard_member_mappings.revoked_at as revoked_at',
      'users.status as user_status',
      'users.role as user_role',
    ])
    .where('heard_member_mappings.account_id', '=', accountId)
    .executeTakeFirst();
  return (
    !mapping ||
    (mapping.revoked_at === null &&
      mapping.user_status === UserStatus.Active &&
      mapping.user_role !== 'none')
  );
};
