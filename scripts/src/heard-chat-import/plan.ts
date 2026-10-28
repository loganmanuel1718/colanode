// Modified by Heard: prepare an offline, deterministic Group Chat history plan.
// This module has no database, network, upload, or mutation execution path.
import { createHash } from 'node:crypto';

import { z } from 'zod/v4';

import {
  messageAttributesSchema,
  type BlockLeaf,
  type MessageAttributes,
} from '@colanode/core';

const sourceId = z.string().uuid();
const timestamp = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Expected a valid timestamp',
  });

const reactionSchema = z
  .object({
    id: sourceId,
    organization_id: sourceId,
    message_id: sourceId,
    user_id: sourceId,
    emoji: z.string().min(1),
    created_at: timestamp,
  })
  .strict();

const taggedItemSchema = z
  .object({
    id: sourceId,
    title: z.string(),
    type: z.enum(['menu_item', 'standalone_recipe']),
  })
  .strict();

const messageSchema = z
  .object({
    id: sourceId,
    organization_id: sourceId,
    user_id: sourceId.nullable(),
    content: z.string(),
    photo_url: z.string().nullable(),
    is_system: z.boolean(),
    is_roux: z.boolean(),
    mentioned_user_ids: z.array(sourceId),
    sources: z.array(z.unknown()).nullable(),
    tagged_items: z.array(taggedItemSchema).nullable(),
    created_at: timestamp,
  })
  .strict();

const inputSchema = z
  .object({
    sourceOrganizationId: sourceId,
    targetWorkspaceId: z.string().min(1),
    targetConversationId: z.string().min(1),
    users: z.record(
      sourceId,
      z
        .object({
          targetUserId: z.string().min(1),
          mentionToken: z.string().optional(),
        })
        .strict()
    ),
    systemActorId: z.string().min(1).optional(),
    rouxActorId: z.string().min(1).optional(),
    records: z.record(z.string(), z.string().min(1)).default({}),
    emojis: z.record(z.string(), z.string().min(1)),
    messages: z.array(messageSchema),
    reactions: z.array(reactionSchema),
  })
  .strict();

export type HeardChatImportInput = z.input<typeof inputSchema>;

export type ImportIssue = {
  sourceId: string;
  field: string;
  reason: string;
};

export type PreparedReaction = {
  key: string;
  sourceId: string;
  targetMessageId: string;
  targetUserId: string;
  sourceEmoji: string;
  reaction: string;
  createdAt: string;
};

export type PreparedMessage = {
  sourceId: string;
  targetId: string;
  createdAt: string;
  targetAuthorId: string;
  kind: 'user' | 'system' | 'roux';
  contentParity: 'complete' | 'deferred';
  originalContent: string;
  attributes: MessageAttributes;
  reactions: PreparedReaction[];
  deferred: {
    photoUrl: string | null;
    sources: unknown[];
    taggedItems: Array<{
      sourceId: string;
      title: string;
      type: 'menu_item' | 'standalone_recipe';
      targetRecordId: string | null;
    }>;
  };
};

export type HeardChatImportPlan = {
  version: 1;
  sourceOrganizationId: string;
  targetWorkspaceId: string;
  targetConversationId: string;
  messages: PreparedMessage[];
  issues: ImportIssue[];
  executionGate: string;
};

const alphabet = '0123456789abcdefghjkmnpqrstvwxyz';

/** A stable 26-character ULID-shaped value plus the Colanode type suffix. */
const stableId = (type: 'ms' | 'bl' | 'me', ...parts: string[]) => {
  const bytes = createHash('sha256').update(JSON.stringify(parts)).digest();
  let value = BigInt(`0x${bytes.subarray(0, 16).toString('hex')}`);
  const chars = Array<string>(26);
  for (let i = 25; i >= 0; i--) {
    chars[i] = alphabet[Number(value & 31n)]!;
    value >>= 5n;
  }
  return chars.join('') + type;
};

const stableReactionKey = (...parts: string[]) =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex');

const chronological = <T extends { created_at: string; id: string }>(
  a: T,
  b: T
) =>
  Date.parse(a.created_at) - Date.parse(b.created_at) ||
  a.id.localeCompare(b.id);

const addText = (leaves: BlockLeaf[], text: string) => {
  if (text) leaves.push({ type: 'text', text });
};

const buildLeaves = (
  content: string,
  sourceMessageId: string,
  sourceMentionIds: string[],
  users: z.output<typeof inputSchema>['users'],
  idNamespace: string[],
  issues: ImportIssue[]
): BlockLeaf[] => {
  const leaves: BlockLeaf[] = [];
  const mentionedIds = [...new Set(sourceMentionIds)].sort();
  const matchedIds = new Set<string>();
  const candidates = mentionedIds.filter((id) => {
    const user = users[id];
    if (!user) {
      issues.push({
        sourceId: sourceMessageId,
        field: 'mentioned_user_ids',
        reason: `No target user mapping for ${id}`,
      });
      return false;
    }
    if (!user.mentionToken || !/^\w+$/.test(user.mentionToken)) {
      issues.push({
        sourceId: sourceMessageId,
        field: 'mentioned_user_ids',
        reason: `No exact @token mapping for ${id}`,
      });
      return false;
    }
    return true;
  });

  let position = 0;
  for (const match of content.matchAll(/@(\w+)/g)) {
    const start = match.index;
    const ids = candidates.filter((id) => users[id]?.mentionToken === match[1]);
    if (ids.length !== 1) continue;

    const id = ids[0]!;
    addText(leaves, content.slice(position, start));
    leaves.push({
      type: 'mention',
      attrs: {
        id: stableId('me', ...idNamespace, sourceMessageId, String(start), id),
        target: users[id]!.targetUserId,
      },
    });
    matchedIds.add(id);
    position = start + match[0].length;
  }
  addText(leaves, content.slice(position));

  for (const id of candidates) {
    if (!matchedIds.has(id)) {
      issues.push({
        sourceId: sourceMessageId,
        field: 'mentioned_user_ids',
        reason: `No unique matching @token found for ${id}`,
      });
    }
  }
  return leaves;
};

export const planHeardChatImport = (raw: unknown): HeardChatImportPlan => {
  const input = inputSchema.parse(raw);
  const issues: ImportIssue[] = [];
  const namespace = [
    input.sourceOrganizationId,
    input.targetWorkspaceId,
    input.targetConversationId,
  ];
  const messageIds = new Set<string>();
  const reactionIds = new Set<string>();

  for (const message of input.messages) {
    if (message.organization_id !== input.sourceOrganizationId)
      throw new Error(`Cross-organization message ${message.id}`);
    if (messageIds.has(message.id))
      throw new Error(`Duplicate source message ${message.id}`);
    messageIds.add(message.id);
  }
  for (const reaction of input.reactions) {
    if (reaction.organization_id !== input.sourceOrganizationId)
      throw new Error(`Cross-organization reaction ${reaction.id}`);
    if (!messageIds.has(reaction.message_id))
      throw new Error(`Reaction ${reaction.id} references a missing message`);
    if (reactionIds.has(reaction.id))
      throw new Error(`Duplicate source reaction ${reaction.id}`);
    reactionIds.add(reaction.id);
  }

  const reactionsByMessage = new Map<
    string,
    z.output<typeof reactionSchema>[]
  >();
  for (const reaction of [...input.reactions].sort(chronological)) {
    const group = reactionsByMessage.get(reaction.message_id) ?? [];
    group.push(reaction);
    reactionsByMessage.set(reaction.message_id, group);
  }

  const messages: PreparedMessage[] = [];
  for (const source of [...input.messages].sort(chronological)) {
    const kind = source.is_system ? 'system' : source.is_roux ? 'roux' : 'user';
    if (source.is_system && source.is_roux)
      throw new Error(`Conflicting message kind ${source.id}`);
    const targetAuthorId =
      kind === 'system'
        ? input.systemActorId
        : kind === 'roux'
          ? input.rouxActorId
          : source.user_id
            ? input.users[source.user_id]?.targetUserId
            : undefined;
    if (!targetAuthorId) {
      issues.push({
        sourceId: source.id,
        field: 'user_id',
        reason: `No explicit target author for ${kind} message; message omitted`,
      });
      continue;
    }

    const targetId = stableId('ms', ...namespace, source.id);
    const blockId = stableId('bl', ...namespace, source.id);
    const leaves = buildLeaves(
      source.content,
      source.id,
      source.mentioned_user_ids,
      input.users,
      namespace,
      issues
    );
    const attributes: MessageAttributes = {
      type: 'message',
      subtype: 'standard',
      parentId: input.targetConversationId,
      content: {
        [blockId]: {
          id: blockId,
          type: 'paragraph',
          parentId: targetId,
          index: 'a0',
          content: leaves,
        },
      },
    };
    messageAttributesSchema.parse(attributes);

    if (kind !== 'user') {
      issues.push({
        sourceId: source.id,
        field: kind === 'roux' ? 'is_roux' : 'is_system',
        reason:
          'No native message kind or styling; preserve provenance for a future renderer',
      });
    }
    if (source.photo_url) {
      issues.push({
        sourceId: source.id,
        field: 'photo_url',
        reason:
          'Asset transfer and Colanode file node are required; no URL hotlink or upload is planned',
      });
    }
    if (source.sources?.length) {
      issues.push({
        sourceId: source.id,
        field: 'sources',
        reason:
          'Roux citations and safety metadata have no native message field',
      });
    }
    if (source.tagged_items?.length) {
      issues.push({
        sourceId: source.id,
        field: 'tagged_items',
        reason:
          'Record tags have no native message field or record mention renderer',
      });
    }

    const reactions: PreparedReaction[] = [];
    for (const reaction of reactionsByMessage.get(source.id) ?? []) {
      const targetUserId = input.users[reaction.user_id]?.targetUserId;
      if (!targetUserId) {
        issues.push({
          sourceId: reaction.id,
          field: 'user_id',
          reason: 'No target reaction author; reaction omitted',
        });
        continue;
      }
      const targetEmojiId = input.emojis[reaction.emoji];
      if (!targetEmojiId) {
        issues.push({
          sourceId: reaction.id,
          field: 'emoji',
          reason: `No Colanode emoji skin ID for ${reaction.emoji}; reaction omitted`,
        });
        continue;
      }
      reactions.push({
        key: stableReactionKey(...namespace, reaction.id),
        sourceId: reaction.id,
        targetMessageId: targetId,
        targetUserId,
        sourceEmoji: reaction.emoji,
        reaction: targetEmojiId,
        createdAt: new Date(reaction.created_at).toISOString(),
      });
    }

    messages.push({
      sourceId: source.id,
      targetId,
      createdAt: new Date(source.created_at).toISOString(),
      targetAuthorId,
      kind,
      contentParity:
        kind !== 'user' ||
        Boolean(source.photo_url) ||
        Boolean(source.sources?.length) ||
        Boolean(source.tagged_items?.length) ||
        source.mentioned_user_ids.length > 0
          ? 'deferred'
          : 'complete',
      originalContent: source.content,
      attributes,
      reactions,
      deferred: {
        photoUrl: source.photo_url,
        sources: source.sources ?? [],
        taggedItems: (source.tagged_items ?? []).map((item) => ({
          sourceId: item.id,
          title: item.title,
          type: item.type,
          targetRecordId: input.records[`${item.type}:${item.id}`] ?? null,
        })),
      },
    });
  }

  return {
    version: 1,
    sourceOrganizationId: input.sourceOrganizationId,
    targetWorkspaceId: input.targetWorkspaceId,
    targetConversationId: input.targetConversationId,
    messages,
    issues,
    executionGate:
      'Offline plan only. A privileged idempotent server importer must verify tenant, authors, node IDs, timestamps, assets, and reactions before any write.',
  };
};
