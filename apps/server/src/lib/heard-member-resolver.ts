import { z } from 'zod/v4';

import {
  heardIdentitySchema,
  type HeardIdentity,
} from '@colanode/server/lib/heard-identity';
import {
  HeardLifecycleConflict,
  HeardLifecycleUnavailable,
} from '@colanode/server/lib/heard-lifecycle-contract';

const ineligibleResponseSchema = z.object({
  code: z.literal('member_ineligible'),
});

export interface HeardMemberResolverOptions {
  resolverUrl: string;
  clientSecret: string;
  timeoutMs: number;
  fetcher?: typeof fetch;
}

/** Fetch current Heard membership; a generic 404 is a configuration failure. */
export const resolveCanonicalHeardMember = async (
  organizationId: string,
  heardUserId: string,
  options: HeardMemberResolverOptions
): Promise<HeardIdentity | null> => {
  let url: URL;
  try {
    url = new URL(options.resolverUrl);
  } catch {
    throw new HeardLifecycleUnavailable();
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const localDevelopment = process.env.NODE_ENV !== 'production' && loopback;
  if (
    url.username ||
    url.password ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(localDevelopment && url.protocol === 'http:'))
  ) {
    throw new HeardLifecycleUnavailable();
  }

  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.clientSecret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ organizationId, heardUserId }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch {
    throw new HeardLifecycleUnavailable();
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new HeardLifecycleUnavailable();
  }
  if (response.status === 404) {
    if (!ineligibleResponseSchema.safeParse(body).success) {
      throw new HeardLifecycleUnavailable();
    }
    return null;
  }
  if (!response.ok) {
    throw new HeardLifecycleUnavailable();
  }
  const parsed = heardIdentitySchema.safeParse(body);
  if (!parsed.success) {
    throw new HeardLifecycleUnavailable();
  }
  if (
    parsed.data.organizationId !== organizationId ||
    parsed.data.heardUserId !== heardUserId
  ) {
    throw new HeardLifecycleConflict();
  }
  return parsed.data;
};
