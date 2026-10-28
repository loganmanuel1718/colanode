import { describe, expect, it, vi } from 'vitest';

import { heardConfigSchema } from '@colanode/server/lib/config/heard';
import {
  consumeHeardIdentityCode,
  HeardIdentityUnavailable,
} from '@colanode/server/lib/heard-identity';

const code = 'a'.repeat(32);
const identity = {
  heardUserId: '6e4d89a5-246f-48d4-a788-4689383d77d7',
  organizationId: '18ddcabc-8e73-44ac-95b9-d51546442765',
  role: 'cook',
  email: 'cook@example.com',
  name: 'Cook',
};

const options = (fetcher: typeof fetch) => ({
  introspectionUrl: 'https://heard.example/api/collaboration/introspect',
  clientSecret: 's'.repeat(32),
  timeoutMs: 3000,
  fetcher,
});

describe('Heard identity code consumption', () => {
  it('is disabled by default and rejects a literal service credential', () => {
    expect(heardConfigSchema.parse(undefined)).toEqual({ enabled: false });
    expect(
      heardConfigSchema.safeParse({
        enabled: true,
        introspectionUrl: 'https://heard.example/api/collaboration/introspect',
        clientSecret: 'literal-secret',
      }).success
    ).toBe(false);
  });

  it('uses only the authenticated back-channel response for identity', async () => {
    const fetcher = vi.fn(async () => Response.json(identity)) as typeof fetch;

    await expect(
      consumeHeardIdentityCode(code, options(fetcher))
    ).resolves.toEqual(identity);
    expect(fetcher).toHaveBeenCalledOnce();
    const [, init] = vi.mocked(fetcher).mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      authorization: `Bearer ${'s'.repeat(32)}`,
    });
    expect(init?.body).toBe(JSON.stringify({ code }));
    expect(init?.redirect).toBe('error');
  });

  it('rejects invalid and FOH identities', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ ...identity, role: 'server' })
    ) as typeof fetch;

    await expect(
      consumeHeardIdentityCode(code, options(fetcher))
    ).rejects.toBeInstanceOf(HeardIdentityUnavailable);
    await expect(
      consumeHeardIdentityCode('short', options(fetcher))
    ).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('treats denied codes as invalid and backend failures as unavailable', async () => {
    const denied = vi.fn(
      async () => new Response(null, { status: 403 })
    ) as typeof fetch;
    const failed = vi.fn(
      async () => new Response(null, { status: 500 })
    ) as typeof fetch;

    await expect(
      consumeHeardIdentityCode(code, options(denied))
    ).resolves.toBeNull();
    await expect(
      consumeHeardIdentityCode(code, options(failed))
    ).rejects.toBeInstanceOf(HeardIdentityUnavailable);
  });

  it('requires HTTPS except for local loopback development', async () => {
    const fetcher = vi.fn(async () => Response.json(identity)) as typeof fetch;

    await expect(
      consumeHeardIdentityCode(code, {
        ...options(fetcher),
        introspectionUrl: 'http://heard.example/introspect',
      })
    ).rejects.toBeInstanceOf(HeardIdentityUnavailable);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
