import { createHash, timingSafeEqual } from 'node:crypto';

import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  HeardLifecycleConflict,
  heardLifecycleEventSchema,
  heardLifecycleResultSchema,
  type HeardLifecycleEvent,
  type HeardLifecycleResult,
} from '@colanode/server/lib/heard-lifecycle-contract';

export interface HeardLifecycleRouteOptions {
  ingressSecret: string;
  processEvent: (event: HeardLifecycleEvent) => Promise<HeardLifecycleResult>;
}

const errorSchema = z.object({ code: z.string() });

const hasValidSecret = (
  authorization: string | undefined,
  secret: string
): boolean => {
  if (!authorization?.startsWith('Bearer ')) return false;
  const candidate = authorization.slice('Bearer '.length);
  if (candidate.length === 0 || candidate.length > 4096) return false;
  const actual = createHash('sha256').update(candidate).digest();
  const expected = createHash('sha256').update(secret).digest();
  return timingSafeEqual(actual, expected);
};

/** Registered only when heard.lifecycle.enabled is explicitly true. */
export const heardLifecycleRoute =
  (options: HeardLifecycleRouteOptions): FastifyPluginCallbackZod =>
  (instance, _, done) => {
    instance.addHook('onRequest', async (request, reply) => {
      if (!hasValidSecret(request.headers.authorization, options.ingressSecret)) {
        return reply.code(401).send({ code: 'unauthorized' });
      }
    });

    instance.route({
      method: 'POST',
      url: '/v1/internal/heard/member-events',
      schema: {
        body: heardLifecycleEventSchema,
        response: {
          200: heardLifecycleResultSchema,
          400: errorSchema,
          401: errorSchema,
          409: errorSchema,
          503: errorSchema,
        },
      },
      handler: async (request, reply) => {
        try {
          return await options.processEvent(request.body);
        } catch (error) {
          if (error instanceof HeardLifecycleConflict) {
            return reply.code(409).send({ code: 'lifecycle_conflict' });
          }
          return reply.code(503).send({ code: 'lifecycle_unavailable' });
        }
      },
    });
    done();
  };
