import { sql } from 'kysely';

import { database } from '@colanode/server/data/database';
import { HeardMappingConflict } from '@colanode/server/lib/heard-error';
import {
  HeardLifecycleConflict,
  type HeardLifecycleEvent,
  type HeardLifecycleResult,
} from '@colanode/server/lib/heard-lifecycle-contract';
import { revokeHeardMember } from '@colanode/server/lib/heard-mappings';
import {
  resolveCanonicalHeardMember,
  type HeardMemberResolverOptions,
} from '@colanode/server/lib/heard-member-resolver';
import { provisionHeardIdentity } from '@colanode/server/lib/heard-provision';

const isSameEvent = (
  receipt: {
    event_id: string;
    heard_user_id: string;
    heard_organization_id: string;
    member_version: string;
    action: 'revoke' | 'reconcile';
    occurred_at: string;
  },
  event: HeardLifecycleEvent
): boolean =>
  receipt.event_id === event.eventId &&
  receipt.heard_user_id === event.heardUserId &&
  receipt.heard_organization_id === event.organizationId &&
  receipt.member_version === event.memberVersion &&
  receipt.action === event.action &&
  receipt.occurred_at === event.occurredAt;

const revokeIfMapped = async (event: HeardLifecycleEvent): Promise<void> => {
  const mapping = await database
    .selectFrom('heard_member_mappings')
    .select('heard_organization_id')
    .where('heard_user_id', '=', event.heardUserId)
    .executeTakeFirst();
  if (!mapping) return;
  if (mapping.heard_organization_id !== event.organizationId) {
    throw new HeardLifecycleConflict();
  }
  await revokeHeardMember(event.organizationId, event.heardUserId);
};

/**
 * The outer transaction holds a per-member advisory lock while the existing
 * provisioning/revocation services commit on separate connections. This
 * serializes effects before advancing the durable version watermark.
 */
export const applyHeardLifecycleEvent = async (
  event: HeardLifecycleEvent,
  resolverOptions: HeardMemberResolverOptions
): Promise<HeardLifecycleResult> => {
  return database.transaction().execute(async (trx) => {
    await sql`select pg_advisory_xact_lock(hashtextextended(${event.heardUserId}, 0))`.execute(
      trx
    );

    const priorEvent = await trx
      .selectFrom('heard_member_event_receipts')
      .selectAll()
      .where('event_id', '=', event.eventId)
      .executeTakeFirst();
    if (priorEvent) {
      if (!isSameEvent(priorEvent, event)) throw new HeardLifecycleConflict();
      return { status: 'duplicate' };
    }

    const priorVersion = await trx
      .selectFrom('heard_member_event_receipts')
      .select('event_id')
      .where('heard_user_id', '=', event.heardUserId)
      .where('member_version', '=', event.memberVersion)
      .executeTakeFirst();
    if (priorVersion) throw new HeardLifecycleConflict();

    const state = await trx
      .selectFrom('heard_member_event_state')
      .selectAll()
      .where('heard_user_id', '=', event.heardUserId)
      .forUpdate()
      .executeTakeFirst();
    if (state && state.heard_organization_id !== event.organizationId) {
      throw new HeardLifecycleConflict();
    }
    const stale =
      state && BigInt(event.memberVersion) < BigInt(state.last_version);
    if (state && BigInt(event.memberVersion) === BigInt(state.last_version)) {
      throw new HeardLifecycleConflict();
    }

    const reserved = await trx
      .insertInto('heard_member_event_receipts')
      .values({
        event_id: event.eventId,
        heard_user_id: event.heardUserId,
        heard_organization_id: event.organizationId,
        member_version: event.memberVersion,
        action: event.action,
        occurred_at: event.occurredAt,
        outcome: stale ? 'stale' : 'applied',
        created_at: new Date(),
      })
      .onConflict((oc) => oc.doNothing())
      .returning('event_id')
      .executeTakeFirst();
    if (!reserved) {
      const conflictingEvent = await trx
        .selectFrom('heard_member_event_receipts')
        .selectAll()
        .where('event_id', '=', event.eventId)
        .executeTakeFirst();
      if (conflictingEvent && isSameEvent(conflictingEvent, event)) {
        return { status: 'duplicate' };
      }
      throw new HeardLifecycleConflict();
    }
    if (stale) return { status: 'stale' };

    try {
      if (event.action === 'revoke') {
        await revokeIfMapped(event);
      } else {
        const identity = await resolveCanonicalHeardMember(
          event.organizationId,
          event.heardUserId,
          resolverOptions
        );
        if (identity) {
          await provisionHeardIdentity(identity);
        } else {
          await revokeIfMapped(event);
        }
      }
    } catch (error) {
      if (error instanceof HeardMappingConflict) {
        throw new HeardLifecycleConflict();
      }
      throw error;
    }

    await trx
      .insertInto('heard_member_event_state')
      .values({
        heard_user_id: event.heardUserId,
        heard_organization_id: event.organizationId,
        last_version: event.memberVersion,
        last_event_id: event.eventId,
        last_action: event.action,
        updated_at: new Date(),
      })
      .onConflict((oc) =>
        oc.column('heard_user_id').doUpdateSet({
          last_version: event.memberVersion,
          last_event_id: event.eventId,
          last_action: event.action,
          updated_at: new Date(),
        })
      )
      .execute();
    return { status: 'applied' };
  });
};
