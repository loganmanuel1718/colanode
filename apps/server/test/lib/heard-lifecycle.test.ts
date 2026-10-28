import { randomBytes, randomUUID } from 'node:crypto';

import fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { heardLifecycleRoute } from '@colanode/server/api/heard-lifecycle';
import { heardConfigSchema } from '@colanode/server/lib/config/heard';
import {
  HeardLifecycleConflict,
  heardLifecycleEventSchema,
} from '@colanode/server/lib/heard-lifecycle-contract';
import { resolveCanonicalHeardMember } from '@colanode/server/lib/heard-member-resolver';

const event = () => ({
  eventId: randomUUID(),
  organizationId: randomUUID(),
  heardUserId: randomUUID(),
  memberVersion: '9007199254740993',
  action: 'reconcile' as const,
  occurredAt: new Date().toISOString(),
});

const apps: ReturnType<typeof fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('Heard lifecycle contract', () => {
  it('stays unmounted by default and requires a separate referenced ingress secret', () => {
    expect(heardConfigSchema.parse(undefined)).toEqual({ enabled: false });
    const identityKey = `HEARD_IDENTITY_TEST_${randomBytes(6).toString('hex')}`;
    const lifecycleKey = `HEARD_LIFECYCLE_TEST_${randomBytes(6).toString('hex')}`;
    process.env[identityKey] = randomBytes(32).toString('hex');
    process.env[lifecycleKey] = randomBytes(32).toString('hex');
    try {
      const parsed = heardConfigSchema.parse({
        enabled: true,
        introspectionUrl: 'https://heard.example/api/collaboration/introspect',
        clientSecret: `env://${identityKey}`,
      });
      if (!parsed.enabled)
        throw new Error('Heard configuration unexpectedly disabled');
      expect(parsed.lifecycle).toEqual({ enabled: false });
      const active = heardConfigSchema.parse({
        enabled: true,
        introspectionUrl: 'https://heard.example/api/collaboration/introspect',
        clientSecret: `env://${identityKey}`,
        lifecycle: {
          enabled: true,
          resolverUrl: 'https://heard.example/api/collaboration/member/resolve',
          ingressSecret: `env://${lifecycleKey}`,
        },
      });
      if (!active.enabled)
        throw new Error('Heard configuration unexpectedly disabled');
      expect(active.lifecycle.enabled).toBe(true);
      expect(
        heardConfigSchema.safeParse({
          enabled: true,
          introspectionUrl:
            'https://heard.example/api/collaboration/introspect',
          clientSecret: `env://${identityKey}`,
          lifecycle: {
            enabled: true,
            resolverUrl:
              'https://heard.example/api/collaboration/member/resolve',
            ingressSecret: `env://${identityKey}`,
          },
        }).success
      ).toBe(false);
      expect(
        heardConfigSchema.safeParse({
          enabled: true,
          introspectionUrl:
            'https://heard.example/api/collaboration/introspect',
          clientSecret: `env://${identityKey}`,
          lifecycle: {
            enabled: true,
            resolverUrl:
              'https://heard.example/api/collaboration/member/resolve',
            ingressSecret: 'literal',
          },
        }).success
      ).toBe(false);
    } finally {
      delete process.env[identityKey];
      delete process.env[lifecycleKey];
    }
  });

  it('preserves bigint versions as canonical decimal strings', () => {
    const valid = event();
    expect(heardLifecycleEventSchema.parse(valid).memberVersion).toBe(
      '9007199254740993'
    );
    for (const invalid of [0, 1, '0', '01', '-1', '9223372036854775808']) {
      expect(
        heardLifecycleEventSchema.safeParse({
          ...valid,
          memberVersion: invalid,
        }).success
      ).toBe(false);
    }
    expect(
      heardLifecycleEventSchema.safeParse({
        ...valid,
        occurredAt: '2026-10-28T12:00:00.12345678901234567890Z',
      }).success
    ).toBe(false);
  });
});

describe('canonical Heard member resolver', () => {
  it('uses authenticated HTTPS and rejects mismatched identities', async () => {
    const request = event();
    const identity = {
      heardUserId: request.heardUserId,
      organizationId: request.organizationId,
      role: 'cook',
      email: 'cook@example.com',
      name: 'Cook',
    };
    const fetcher = vi.fn(async () => Response.json(identity)) as typeof fetch;
    const options = {
      resolverUrl: 'https://heard.example/api/collaboration/member/resolve',
      clientSecret: randomBytes(32).toString('hex'),
      timeoutMs: 3000,
      fetcher,
    };
    await expect(
      resolveCanonicalHeardMember(
        request.organizationId,
        request.heardUserId,
        options
      )
    ).resolves.toEqual(identity);
    expect(fetcher).toHaveBeenCalledOnce();
    const [, init] = vi.mocked(fetcher).mock.calls[0]!;
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(
      JSON.stringify({
        organizationId: request.organizationId,
        heardUserId: request.heardUserId,
      })
    );
    expect(init?.headers).toMatchObject({
      authorization: `Bearer ${options.clientSecret}`,
    });
    expect(init?.redirect).toBe('error');
    expect(init?.cache).toBe('no-store');

    const mismatch = vi.fn(async () =>
      Response.json({ ...identity, organizationId: randomUUID() })
    ) as typeof fetch;
    await expect(
      resolveCanonicalHeardMember(request.organizationId, request.heardUserId, {
        ...options,
        fetcher: mismatch,
      })
    ).rejects.toBeInstanceOf(HeardLifecycleConflict);
  });

  it('accepts only a distinguished ineligible 404', async () => {
    const request = event();
    const options = {
      resolverUrl: 'https://heard.example/api/collaboration/member/resolve',
      clientSecret: randomBytes(32).toString('hex'),
      timeoutMs: 3000,
    };
    await expect(
      resolveCanonicalHeardMember(request.organizationId, request.heardUserId, {
        ...options,
        fetcher: vi.fn(async () =>
          Response.json({ code: 'member_ineligible' }, { status: 404 })
        ) as typeof fetch,
      })
    ).resolves.toBeNull();
    await expect(
      resolveCanonicalHeardMember(request.organizationId, request.heardUserId, {
        ...options,
        fetcher: vi.fn(
          async () => new Response('<html>missing</html>', { status: 404 })
        ) as typeof fetch,
      })
    ).rejects.toThrow('Heard lifecycle processing is unavailable');
    await expect(
      resolveCanonicalHeardMember(request.organizationId, request.heardUserId, {
        ...options,
        resolverUrl: 'http://heard.example/api/collaboration/member/resolve',
      })
    ).rejects.toThrow('Heard lifecycle processing is unavailable');
  });
});

describe('private lifecycle route', () => {
  it('authenticates before parsing and maps durable handler outcomes', async () => {
    const secret = randomBytes(32).toString('hex');
    const processEvent = vi.fn(async () => ({ status: 'applied' as const }));
    const app = fastify();
    apps.push(app);
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.register(heardLifecycleRoute({ ingressSecret: secret, processEvent }));
    await app.ready();

    const url = '/v1/internal/heard/member-events';
    const unauthorized = await app.inject({ method: 'POST', url, payload: {} });
    expect(unauthorized.statusCode).toBe(401);
    expect(processEvent).not.toHaveBeenCalled();

    const invalid = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${secret}` },
      payload: { memberVersion: 1 },
    });
    expect(invalid.statusCode).toBe(400);
    expect(processEvent).not.toHaveBeenCalled();

    const accepted = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${secret}` },
      payload: event(),
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ status: 'applied' });
    processEvent.mockRejectedValueOnce(new HeardLifecycleConflict());
    const conflict = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${secret}` },
      payload: event(),
    });
    expect(conflict.statusCode).toBe(409);
    processEvent.mockRejectedValueOnce(new Error('backend down'));
    const unavailable = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${secret}` },
      payload: event(),
    });
    expect(unavailable.statusCode).toBe(503);
  });
});
