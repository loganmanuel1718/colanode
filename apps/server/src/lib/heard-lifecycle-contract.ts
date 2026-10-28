import { z } from 'zod/v4';

const maxPostgresBigint = 9223372036854775807n;

export const heardMemberVersionSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine((value) => BigInt(value) <= maxPostgresBigint);

export const heardLifecycleEventSchema = z.object({
  eventId: z.uuid(),
  organizationId: z.uuid(),
  heardUserId: z.uuid(),
  memberVersion: heardMemberVersionSchema,
  action: z.enum(['revoke', 'reconcile']),
  occurredAt: z.iso.datetime({ offset: true }).max(40),
});

export type HeardLifecycleEvent = z.infer<typeof heardLifecycleEventSchema>;

export const heardLifecycleResultSchema = z.object({
  status: z.enum(['applied', 'duplicate', 'stale']),
});

export type HeardLifecycleResult = z.infer<typeof heardLifecycleResultSchema>;

export class HeardLifecycleConflict extends Error {
  constructor() {
    super('Heard lifecycle event conflicts with stored identity state');
  }
}

export class HeardLifecycleUnavailable extends Error {
  constructor() {
    super('Heard lifecycle processing is unavailable');
  }
}
