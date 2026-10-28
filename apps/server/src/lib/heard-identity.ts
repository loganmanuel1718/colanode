import { z } from 'zod/v4';

export const heardIdentitySchema = z.object({
  heardUserId: z.uuid(),
  organizationId: z.uuid(),
  role: z.enum(['admin', 'chef', 'cook']),
  email: z.email(),
  name: z.string().trim().min(1).max(255),
});

export type HeardIdentity = z.infer<typeof heardIdentitySchema>;

export interface HeardIdentityClientOptions {
  introspectionUrl: string;
  clientSecret: string;
  timeoutMs: number;
  fetcher?: typeof fetch;
}

export class HeardIdentityUnavailable extends Error {
  constructor() {
    super('Heard identity service is unavailable');
  }
}

/**
 * Consume a one-time code issued after Heard verifies the user's session.
 * The browser supplies only the opaque code. Identity and role come solely
 * from this authenticated server-to-server response.
 *
 * No public route calls this yet: device-token revocation and org workspace
 * provisioning must land before the exchange can be exposed.
 */
export const consumeHeardIdentityCode = async (
  code: string,
  options: HeardIdentityClientOptions
): Promise<HeardIdentity | null> => {
  if (typeof code !== 'string' || code.length < 16 || code.length > 512) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(options.introspectionUrl);
  } catch {
    throw new HeardIdentityUnavailable();
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
    throw new HeardIdentityUnavailable();
  }

  try {
    const response = await (options.fetcher ?? fetch)(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.clientSecret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ code }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs),
    });

    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 404
    ) {
      return null;
    }
    if (!response.ok) {
      throw new HeardIdentityUnavailable();
    }

    const parsed = heardIdentitySchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new HeardIdentityUnavailable();
    }
    return parsed.data;
  } catch {
    // Never include the code, shared secret, URL, or response body in logs/errors.
    throw new HeardIdentityUnavailable();
  }
};
