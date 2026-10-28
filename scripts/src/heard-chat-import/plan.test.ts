// Modified by Heard: synthetic fixtures for offline chat history mapping.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extractBlocksMentions, messageAttributesSchema } from '@colanode/core';

import { planHeardChatImport, type HeardChatImportInput } from './plan';

const org = '11111111-1111-4111-8111-111111111111';
const author = '22222222-2222-4222-8222-222222222222';
const mentioned = '33333333-3333-4333-8333-333333333333';
const reactionAuthor = '44444444-4444-4444-8444-444444444444';
const firstId = '55555555-5555-4555-8555-555555555555';
const rouxId = '66666666-6666-4666-8666-666666666666';
const systemId = '77777777-7777-4777-8777-777777777777';
const reactionId = '88888888-8888-4888-8888-888888888888';
const tagId = '99999999-9999-4999-8999-999999999999';

const message = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  organization_id: org,
  user_id: author,
  content: 'Hi @Alex, see the recipe.',
  photo_url: null,
  is_system: false,
  is_roux: false,
  mentioned_user_ids: [mentioned],
  sources: null,
  tagged_items: null,
  created_at: '2026-01-02T03:04:05.000Z',
  ...overrides,
});

const fixture = (): HeardChatImportInput => ({
  sourceOrganizationId: org,
  targetWorkspaceId: '01aaaaaaaaaaaaaaaaaaaaaaaawc',
  targetConversationId: '01bbbbbbbbbbbbbbbbbbbbbbbbch',
  users: {
    [author]: { targetUserId: '01ccccccccccccccccccccccccus' },
    [mentioned]: {
      targetUserId: '01ddddddddddddddddddddddddus',
      mentionToken: 'Alex',
    },
    [reactionAuthor]: { targetUserId: '01eeeeeeeeeeeeeeeeeeeeeeeeus' },
  },
  systemActorId: '01ffffffffffffffffffffffffus',
  rouxActorId: '01ggggggggggggggggggggggggus',
  records: { [`menu_item:${tagId}`]: '01hhhhhhhhhhhhhhhhhhhhhhhhrc' },
  emojis: { '🔥': '01jjjjjjjjjjjjjjjjjjjjjjes' },
  messages: [
    message(rouxId, {
      user_id: null,
      content: 'According to the recipe, chill it.',
      is_roux: true,
      mentioned_user_ids: [],
      sources: [{ id: tagId, title: 'Soup', type: 'recipe' }],
      created_at: '2026-01-02T03:05:05.000Z',
    }),
    message(firstId, {
      photo_url: 'https://example.invalid/chat-photos/example.jpg',
      tagged_items: [{ id: tagId, title: 'Soup', type: 'menu_item' }],
    }),
    message(systemId, {
      user_id: null,
      content: 'Service started',
      is_system: true,
      mentioned_user_ids: [],
      created_at: '2026-01-02T03:06:05.000Z',
    }),
  ],
  reactions: [
    {
      id: reactionId,
      organization_id: org,
      message_id: firstId,
      user_id: reactionAuthor,
      emoji: '🔥',
      created_at: '2026-01-02T03:07:05.000Z',
    },
  ],
});

describe('planHeardChatImport', () => {
  it('maps text, exact user mentions, authors, reactions, and deferred parity fields', () => {
    const plan = planHeardChatImport(fixture());
    assert.equal(plan.messages.length, 3);
    const first = plan.messages[0]!;
    assert.equal(first.sourceId, firstId);
    assert.equal(first.kind, 'user');
    assert.equal(first.contentParity, 'deferred');
    assert.equal(first.originalContent, 'Hi @Alex, see the recipe.');
    assert.equal(first.createdAt, '2026-01-02T03:04:05.000Z');
    assert.equal(first.targetAuthorId, fixture().users[author]?.targetUserId);
    assert.equal(
      messageAttributesSchema.safeParse(first.attributes).success,
      true
    );
    const mentions = extractBlocksMentions(
      first.targetId,
      first.attributes.content
    );
    assert.equal(mentions.length, 1);
    assert.equal(mentions[0]?.target, fixture().users[mentioned]?.targetUserId);
    assert.match(mentions[0]!.id, /me$/);
    assert.equal(first.reactions[0]?.sourceEmoji, '🔥');
    assert.equal(first.reactions[0]?.reaction, fixture().emojis['🔥']);
    assert.equal(first.reactions[0]?.targetMessageId, first.targetId);
    assert.equal(
      first.deferred.photoUrl,
      'https://example.invalid/chat-photos/example.jpg'
    );
    assert.equal(
      first.deferred.taggedItems[0]?.targetRecordId,
      fixture().records?.[`menu_item:${tagId}`]
    );
    assert.equal(plan.messages[1]?.targetAuthorId, fixture().rouxActorId);
    assert.equal(plan.messages[1]?.contentParity, 'deferred');
    assert.equal(plan.messages[2]?.targetAuthorId, fixture().systemActorId);
    assert.deepEqual(
      new Set(plan.issues.map((issue) => issue.field)),
      new Set(['photo_url', 'tagged_items', 'is_roux', 'sources', 'is_system'])
    );
  });

  it('is stable across runs and source row order', () => {
    const input = fixture();
    const first = planHeardChatImport(input);
    const second = planHeardChatImport({
      ...input,
      messages: [...input.messages].reverse(),
      reactions: [...input.reactions].reverse(),
    });
    assert.deepEqual(first, second);
    assert.deepEqual(first, planHeardChatImport(input));
  });

  it('marks plain text as complete while retaining the global execution gate', () => {
    const input = fixture();
    input.messages = [
      message(firstId, {
        content: 'Ready for service',
        mentioned_user_ids: [],
      }),
    ];
    input.reactions = [];
    const plan = planHeardChatImport(input);
    assert.equal(plan.messages[0]?.contentParity, 'complete');
    assert.equal(plan.issues.length, 0);
    assert.match(plan.executionGate, /privileged idempotent server importer/);
  });

  it('omits unmapped authors and reactions with explicit issues', () => {
    const input = fixture();
    delete (input.users as Record<string, unknown>)[reactionAuthor];
    delete (input as { rouxActorId?: string }).rouxActorId;
    const plan = planHeardChatImport(input);
    assert.equal(plan.messages.length, 2);
    assert.equal(plan.messages[0]?.reactions.length, 0);
    assert.ok(
      plan.issues.some(
        (issue) => issue.sourceId === rouxId && issue.field === 'user_id'
      )
    );
    assert.ok(
      plan.issues.some(
        (issue) => issue.sourceId === reactionId && issue.field === 'user_id'
      )
    );
  });

  it('requires an explicit Unicode to Colanode emoji skin mapping', () => {
    const input = fixture();
    input.emojis = {};
    const plan = planHeardChatImport(input);
    assert.equal(plan.messages[0]?.reactions.length, 0);
    assert.ok(
      plan.issues.some(
        (issue) => issue.sourceId === reactionId && issue.field === 'emoji'
      )
    );
  });

  it('preserves text and reports ambiguous mention mappings', () => {
    const input = fixture();
    input.users[reactionAuthor] = {
      targetUserId: '01eeeeeeeeeeeeeeeeeeeeeeeeus',
      mentionToken: 'Alex',
    };
    input.messages = [
      message(firstId, { mentioned_user_ids: [mentioned, reactionAuthor] }),
    ];
    input.reactions = [];
    const plan = planHeardChatImport(input);
    const leaves = Object.values(plan.messages[0]!.attributes.content!)[0]!
      .content!;
    assert.deepEqual(leaves, [
      { type: 'text', text: 'Hi @Alex, see the recipe.' },
    ]);
    assert.equal(
      plan.issues.filter((issue) => issue.field === 'mentioned_user_ids')
        .length,
      2
    );
  });

  it('rejects cross-tenant rows, orphan reactions, and duplicate source IDs', () => {
    const crossTenant = fixture();
    crossTenant.messages[0]!.organization_id =
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    assert.throws(
      () => planHeardChatImport(crossTenant),
      /Cross-organization message/
    );

    const orphan = fixture();
    orphan.reactions[0]!.message_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    assert.throws(
      () => planHeardChatImport(orphan),
      /references a missing message/
    );

    const duplicate = fixture();
    duplicate.messages.push(duplicate.messages[0]!);
    assert.throws(
      () => planHeardChatImport(duplicate),
      /Duplicate source message/
    );

    const unknownColumn = fixture();
    (unknownColumn.messages[0] as Record<string, unknown>).unreviewed_field =
      'must not disappear';
    assert.throws(() => planHeardChatImport(unknownColumn), /unrecognized_key/);
  });
});
