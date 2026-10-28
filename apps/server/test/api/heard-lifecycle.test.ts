import { randomBytes, randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { UserStatus } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { applyHeardLifecycleEvent } from '@colanode/server/lib/heard-lifecycle';
import {
  HeardLifecycleConflict,
  HeardLifecycleUnavailable,
  type HeardLifecycleEvent,
} from '@colanode/server/lib/heard-lifecycle-contract';
import { parseToken, verifyToken } from '@colanode/server/lib/tokens';

import { createDevice } from '../helpers/seed';

const event = (
  organizationId: string,
  heardUserId: string,
  memberVersion: string,
  action: HeardLifecycleEvent['action']
): HeardLifecycleEvent => ({
  eventId: randomUUID(),
  organizationId,
  heardUserId,
  memberVersion,
  action,
  occurredAt: new Date().toISOString(),
});

const options = (fetcher: typeof fetch) => ({
  resolverUrl: 'https://heard.example/api/collaboration/member/resolve',
  clientSecret: randomBytes(32).toString('hex'),
  timeoutMs: 3000,
  fetcher,
});

describe('durable Heard lifecycle ledger', () => {
  it('deduplicates events, rejects conflicting versions, and orders revoke/reconcile', async () => {
    const organizationId = randomUUID();
    const heardUserId = randomUUID();
    const identity = {
      organizationId,
      heardUserId,
      role: 'admin',
      email: `member-${randomUUID()}@example.com`,
      name: 'Lifecycle Member',
    };
    const lookup = vi.fn(async () => Response.json(identity)) as typeof fetch;
    const initial = event(organizationId, heardUserId, '1', 'reconcile');
    expect(await applyHeardLifecycleEvent(initial, options(lookup))).toEqual({
      status: 'applied',
    });
    expect(await applyHeardLifecycleEvent(initial, options(lookup))).toEqual({
      status: 'duplicate',
    });
    expect(lookup).toHaveBeenCalledOnce();
    await expect(
      applyHeardLifecycleEvent(
        { ...initial, action: 'revoke' },
        options(lookup)
      )
    ).rejects.toBeInstanceOf(HeardLifecycleConflict);
    await expect(
      applyHeardLifecycleEvent(
        event(organizationId, heardUserId, '1', 'reconcile'),
        options(lookup)
      )
    ).rejects.toBeInstanceOf(HeardLifecycleConflict);

    const mapping = await database
      .selectFrom('heard_member_mappings')
      .select(['account_id', 'user_id'])
      .where('heard_user_id', '=', heardUserId)
      .executeTakeFirstOrThrow();
    const { token } = await createDevice({ accountId: mapping.account_id });
    expect((await verifyToken(parseToken(token)!)).authenticated).toBe(true);

    const revoke = event(organizationId, heardUserId, '3', 'revoke');
    expect(await applyHeardLifecycleEvent(revoke, options(lookup))).toEqual({
      status: 'applied',
    });
    expect((await verifyToken(parseToken(token)!)).authenticated).toBe(false);
    expect(
      (
        await database
          .selectFrom('users')
          .select('status')
          .where('id', '=', mapping.user_id)
          .executeTakeFirstOrThrow()
      ).status
    ).toBe(UserStatus.Removed);

    const stale = event(organizationId, heardUserId, '2', 'reconcile');
    expect(await applyHeardLifecycleEvent(stale, options(lookup))).toEqual({
      status: 'stale',
    });
    expect(await applyHeardLifecycleEvent(stale, options(lookup))).toEqual({
      status: 'duplicate',
    });
    expect(lookup).toHaveBeenCalledOnce();

    const ineligible = vi.fn(async () =>
      Response.json({ code: 'member_ineligible' }, { status: 404 })
    ) as typeof fetch;
    expect(
      await applyHeardLifecycleEvent(
        event(organizationId, heardUserId, '4', 'reconcile'),
        options(ineligible)
      )
    ).toEqual({ status: 'applied' });
    expect(
      (
        await database
          .selectFrom('users')
          .select('status')
          .where('id', '=', mapping.user_id)
          .executeTakeFirstOrThrow()
      ).status
    ).toBe(UserStatus.Removed);

    const current = vi.fn(async () =>
      Response.json({ ...identity, role: 'cook' })
    ) as typeof fetch;
    expect(
      await applyHeardLifecycleEvent(
        event(organizationId, heardUserId, '5', 'reconcile'),
        options(current)
      )
    ).toEqual({ status: 'applied' });
    expect(
      await database
        .selectFrom('users')
        .select(['role', 'status'])
        .where('id', '=', mapping.user_id)
        .executeTakeFirstOrThrow()
    ).toEqual({ role: 'collaborator', status: UserStatus.Active });
    expect(
      (
        await database
          .selectFrom('heard_member_event_state')
          .select('last_version')
          .where('heard_user_id', '=', heardUserId)
          .executeTakeFirstOrThrow()
      ).last_version
    ).toBe('5');
    await expect(
      applyHeardLifecycleEvent(
        event(randomUUID(), heardUserId, '6', 'revoke'),
        options(current)
      )
    ).rejects.toBeInstanceOf(HeardLifecycleConflict);
  });

  it('keeps versions above Number.MAX_SAFE_INTEGER ordered and rolls back failed lookup', async () => {
    const organizationId = randomUUID();
    const heardUserId = randomUUID();
    const unused = vi.fn() as typeof fetch;
    const high = event(
      organizationId,
      heardUserId,
      '9007199254740993',
      'revoke'
    );
    expect(await applyHeardLifecycleEvent(high, options(unused))).toEqual({
      status: 'applied',
    });
    expect(
      await applyHeardLifecycleEvent(
        event(organizationId, heardUserId, '9007199254740992', 'revoke'),
        options(unused)
      )
    ).toEqual({ status: 'stale' });

    const next = event(
      organizationId,
      heardUserId,
      '9007199254740994',
      'reconcile'
    );
    const unavailable = vi.fn(async () => {
      throw new Error('network unavailable');
    }) as typeof fetch;
    await expect(
      applyHeardLifecycleEvent(next, options(unavailable))
    ).rejects.toBeInstanceOf(HeardLifecycleUnavailable);
    expect(
      await database
        .selectFrom('heard_member_event_receipts')
        .select('event_id')
        .where('event_id', '=', next.eventId)
        .executeTakeFirst()
    ).toBeUndefined();
    expect(
      (
        await database
          .selectFrom('heard_member_event_state')
          .select('last_version')
          .where('heard_user_id', '=', heardUserId)
          .executeTakeFirstOrThrow()
      ).last_version
    ).toBe('9007199254740993');

    const eligible = vi.fn(async () =>
      Response.json({
        organizationId,
        heardUserId,
        role: 'cook',
        email: `restored-${randomUUID()}@example.com`,
        name: 'Restored Member',
      })
    ) as typeof fetch;
    expect(await applyHeardLifecycleEvent(next, options(eligible))).toEqual({
      status: 'applied',
    });
  });

  it('serializes concurrent versions so an older reconcile cannot undo a later revoke', async () => {
    const organizationId = randomUUID();
    const heardUserId = randomUUID();
    const identity = {
      organizationId,
      heardUserId,
      role: 'cook',
      email: `concurrent-${randomUUID()}@example.com`,
      name: 'Concurrent Member',
    };
    const lookup = vi.fn(async () => Response.json(identity)) as typeof fetch;
    await applyHeardLifecycleEvent(
      event(organizationId, heardUserId, '1', 'reconcile'),
      options(lookup)
    );
    const results = await Promise.all([
      applyHeardLifecycleEvent(
        event(organizationId, heardUserId, '2', 'reconcile'),
        options(lookup)
      ),
      applyHeardLifecycleEvent(
        event(organizationId, heardUserId, '3', 'revoke'),
        options(lookup)
      ),
    ]);
    expect(results.map((result) => result.status)).toContain('applied');
    const mapping = await database
      .selectFrom('heard_member_mappings')
      .select('user_id')
      .where('heard_user_id', '=', heardUserId)
      .executeTakeFirstOrThrow();
    expect(
      (
        await database
          .selectFrom('users')
          .select('status')
          .where('id', '=', mapping.user_id)
          .executeTakeFirstOrThrow()
      ).status
    ).toBe(UserStatus.Removed);
    expect(
      (
        await database
          .selectFrom('heard_member_event_state')
          .select('last_version')
          .where('heard_user_id', '=', heardUserId)
          .executeTakeFirstOrThrow()
      ).last_version
    ).toBe('3');
  });
});
