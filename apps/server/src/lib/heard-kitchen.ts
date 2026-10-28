import { generateId, IdType } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { HeardMappingConflict } from '@colanode/server/lib/heard-error';
import { createNode, fetchNode, updateNode } from '@colanode/server/lib/nodes';

export interface KitchenNodeIds {
  spaceId: string;
  channelId: string;
}

/** The mapping row owns stable IDs even if node creation needs a retry. */
export const ensureKitchenChannel = async (
  organizationId: string,
  workspaceId: string,
  firstUserId: string
): Promise<KitchenNodeIds> => {
  const ids = await database.transaction().execute(async (trx) => {
    const mapping = await trx
      .selectFrom('heard_workspace_mappings')
      .select(['workspace_id', 'kitchen_space_id', 'kitchen_channel_id'])
      .where('heard_organization_id', '=', organizationId)
      .forUpdate()
      .executeTakeFirst();
    if (!mapping || mapping.workspace_id !== workspaceId) {
      throw new HeardMappingConflict();
    }
    if (mapping.kitchen_space_id && mapping.kitchen_channel_id) {
      return {
        spaceId: mapping.kitchen_space_id,
        channelId: mapping.kitchen_channel_id,
      };
    }
    if (mapping.kitchen_space_id || mapping.kitchen_channel_id) {
      throw new HeardMappingConflict();
    }
    const spaceId = generateId(IdType.Space);
    const channelId = generateId(IdType.Channel);
    await trx
      .updateTable('heard_workspace_mappings')
      .set({ kitchen_space_id: spaceId, kitchen_channel_id: channelId })
      .where('heard_organization_id', '=', organizationId)
      .execute();
    return { spaceId, channelId };
  });

  const space = await fetchNode(ids.spaceId);
  if (!space) {
    await createNode({
      nodeId: ids.spaceId,
      rootId: ids.spaceId,
      workspaceId,
      userId: firstUserId,
      attributes: {
        type: 'space',
        name: 'Team',
        visibility: 'public',
        collaborators: { [firstUserId]: 'admin' },
      },
    });
  }
  const storedSpace = await fetchNode(ids.spaceId);
  if (
    !storedSpace ||
    storedSpace.workspace_id !== workspaceId ||
    storedSpace.type !== 'space' ||
    storedSpace.root_id !== ids.spaceId
  ) {
    throw new HeardMappingConflict();
  }

  const channel = await fetchNode(ids.channelId);
  if (!channel) {
    await createNode({
      nodeId: ids.channelId,
      rootId: ids.spaceId,
      workspaceId,
      userId: firstUserId,
      attributes: {
        type: 'channel',
        name: 'Kitchen',
        parentId: ids.spaceId,
      },
    });
  }
  const storedChannel = await fetchNode(ids.channelId);
  if (
    !storedChannel ||
    storedChannel.workspace_id !== workspaceId ||
    storedChannel.type !== 'channel' ||
    storedChannel.parent_id !== ids.spaceId ||
    storedChannel.root_id !== ids.spaceId
  ) {
    throw new HeardMappingConflict();
  }
  return ids;
};

/** Keep node-level Kitchen access in step with the verified Heard role. */
export const syncKitchenMemberRole = async (
  ids: KitchenNodeIds,
  workspaceId: string,
  userId: string,
  role: 'admin' | 'collaborator'
): Promise<void> => {
  const current = await fetchNode(ids.spaceId);
  if (
    !current ||
    current.workspace_id !== workspaceId ||
    current.type !== 'space'
  ) {
    throw new HeardMappingConflict();
  }
  if (current.attributes.type !== 'space') {
    throw new HeardMappingConflict();
  }
  if (current.attributes.collaborators[userId] === role) {
    return;
  }
  const updated = await updateNode({
    nodeId: ids.spaceId,
    workspaceId,
    userId,
    updater: (attributes) => {
      if (attributes.type !== 'space') return null;
      return {
        ...attributes,
        collaborators: { ...attributes.collaborators, [userId]: role },
      };
    },
  });
  if (!updated) {
    const latest = await fetchNode(ids.spaceId);
    if (
      latest?.attributes.type !== 'space' ||
      latest.attributes.collaborators[userId] !== role
    ) {
      throw new HeardMappingConflict();
    }
  }
};

export const removeKitchenMemberRole = async (
  spaceId: string,
  workspaceId: string,
  userId: string
): Promise<void> => {
  const current = await fetchNode(spaceId);
  if (!current) return;
  if (
    current.workspace_id !== workspaceId ||
    current.attributes.type !== 'space'
  ) {
    throw new HeardMappingConflict();
  }
  if (!current.attributes.collaborators[userId]) return;

  const updated = await updateNode({
    nodeId: spaceId,
    workspaceId,
    userId,
    updater: (attributes) => {
      if (attributes.type !== 'space') return null;
      const collaborators = { ...attributes.collaborators };
      delete collaborators[userId];
      return { ...attributes, collaborators };
    },
  });
  if (!updated) {
    const latest = await fetchNode(spaceId);
    if (
      latest?.attributes.type !== 'space' ||
      latest.attributes.collaborators[userId]
    ) {
      throw new HeardMappingConflict();
    }
  }
};

export const isProtectedKitchenNode = async (
  workspaceId: string,
  nodeId: string
): Promise<boolean> => {
  const mapping = await database
    .selectFrom('heard_workspace_mappings')
    .select('workspace_id')
    .where('workspace_id', '=', workspaceId)
    .where((eb) =>
      eb.or([
        eb('kitchen_space_id', '=', nodeId),
        eb('kitchen_channel_id', '=', nodeId),
      ])
    )
    .executeTakeFirst();
  return mapping !== undefined;
};
