import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { database } from '@colanode/server/data/database';
import { config } from '@colanode/server/lib/config';
import { HeardMappingConflict } from '@colanode/server/lib/heard-mappings';
import { provisionHeardIdentity } from '@colanode/server/lib/heard-provision';

import { buildTestApp } from '../helpers/app';

// Native auth routes that must not exist in Heard mode (HEA-277 F-1).
// Payloads are valid so a registered route would answer 200/400, never 404.
const nativeAuthRoutes = [
  {
    method: 'POST' as const,
    url: '/client/v1/auth/email/login',
    payload: { email: 'alice@example.com', password: 'Password123!' },
  },
  {
    method: 'POST' as const,
    url: '/client/v1/auth/email/register',
    payload: {
      name: 'Alice',
      email: 'alice@example.com',
      password: 'Password123!',
    },
  },
  {
    method: 'POST' as const,
    url: '/client/v1/auth/email/verify',
    payload: { id: 'missing', otp: '123456' },
  },
  {
    method: 'POST' as const,
    url: '/client/v1/auth/email/password-reset/init',
    payload: { email: 'alice@example.com' },
  },
  {
    method: 'POST' as const,
    url: '/client/v1/auth/email/password-reset/complete',
    payload: { id: 'missing', otp: '123456', password: 'Password123!' },
  },
  {
    method: 'POST' as const,
    url: '/client/v1/auth/google/login',
    payload: { code: 'unused' },
  },
];

const countAccountsWithEmail = async (email: string) =>
  (
    await database
      .selectFrom('accounts')
      .select('id')
      .where('email', '=', email)
      .execute()
  ).length;

describe('native sign-up with heard.enabled false (upstream behaviour)', () => {
  const app = buildTestApp();

  beforeAll(async () => {
    expect(config.heard.enabled).toBe(false);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets a native registration squat an email and block Heard provisioning', async () => {
    // This is the lockout the Heard-mode gate prevents.
    const email = `squatted-${randomUUID()}@example.com`;
    const registration = await app.inject({
      method: 'POST',
      url: '/client/v1/auth/email/register',
      payload: { name: 'Squatter', email, password: 'Password123!' },
    });
    expect(registration.statusCode).toBe(200);

    await expect(
      provisionHeardIdentity({
        heardUserId: randomUUID(),
        organizationId: randomUUID(),
        role: 'cook',
        email,
        name: 'Member',
      })
    ).rejects.toBeInstanceOf(HeardMappingConflict);
  });
});

describe('native auth routes with heard.enabled true', () => {
  const originalHeard = config.heard;
  let app: FastifyInstance;

  beforeAll(async () => {
    config.heard = {
      enabled: true,
      introspectionUrl: 'https://heard.invalid/api/collaboration/introspect',
      clientSecret: 'test-only-secret-that-is-at-least-32-chars',
      timeoutMs: 3000,
      lifecycle: { enabled: false },
    };
    // Routes are registered when the app becomes ready, so build it after the
    // config change.
    app = buildTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    config.heard = originalHeard;
  });

  it('does not register native email, OTP, password-reset or Google routes', async () => {
    for (const route of nativeAuthRoutes) {
      const response = await app.inject(route);
      expect(response.statusCode, `${route.method} ${route.url}`).toBe(404);
    }
  });

  it('keeps logout registered', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/client/v1/auth/logout',
    });
    expect(response.statusCode).toBe(401);
  });

  it('cannot squat a member email, so that member provisions a dedicated account', async () => {
    const email = 'alice@example.com';
    const registration = await app.inject({
      method: 'POST',
      url: '/client/v1/auth/email/register',
      payload: { name: 'Squatter', email, password: 'Password123!' },
    });
    expect(registration.statusCode).toBe(404);
    expect(await countAccountsWithEmail(email)).toBe(0);

    const heardUserId = randomUUID();
    const result = await provisionHeardIdentity({
      heardUserId,
      organizationId: randomUUID(),
      role: 'cook',
      email,
      name: 'Alice',
    });

    const accounts = await database
      .selectFrom('accounts')
      .select(['id', 'password', 'attributes'])
      .where('email', '=', email)
      .execute();
    expect(accounts).toEqual([
      { id: result.accountId, password: null, attributes: null },
    ]);
    expect(
      await database
        .selectFrom('heard_member_mappings')
        .select(['heard_user_id', 'user_id'])
        .where('account_id', '=', result.accountId)
        .executeTakeFirstOrThrow()
    ).toEqual({ heard_user_id: heardUserId, user_id: result.userId });
  });
});
