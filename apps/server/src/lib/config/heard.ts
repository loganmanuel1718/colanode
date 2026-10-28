import { z } from 'zod/v4';

import { resolveConfigReference } from './utils';

// Heard integration is inert until both servers are ready to enforce
// provisioning and revocation. Keep the shared secret out of config files.
export const heardConfigSchema = z
  .discriminatedUnion('enabled', [
    z.object({ enabled: z.literal(false) }),
    z.object({
      enabled: z.literal(true),
      introspectionUrl: z
        .string()
        .transform(resolveConfigReference)
        .pipe(z.url()),
      clientSecret: z
        .string()
        .regex(/^(env|file):\/\//, 'Use an env:// or file:// secret reference')
        .transform(resolveConfigReference)
        .pipe(z.string().min(32)),
      timeoutMs: z.number().int().min(100).max(10_000).default(3000),
    }),
  ])
  .prefault({ enabled: false });

export type HeardConfig = z.infer<typeof heardConfigSchema>;
