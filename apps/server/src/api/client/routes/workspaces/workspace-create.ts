import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';

import {
  ApiErrorCode,
  workspaceCreateInputSchema,
  apiErrorOutputSchema,
  workspaceOutputSchema,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { isHeardAccountManaged } from '@colanode/server/lib/heard-mappings';
import { createWorkspace } from '@colanode/server/lib/workspaces';

export const workspaceCreateRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'POST',
    url: '/',
    schema: {
      body: workspaceCreateInputSchema,
      response: {
        200: workspaceOutputSchema,
        400: apiErrorOutputSchema,
        403: apiErrorOutputSchema,
      },
    },
    handler: async (request, reply) => {
      const input = request.body;

      if (await isHeardAccountManaged(request.account.id)) {
        return reply.code(403).send({
          code: ApiErrorCode.WorkspaceNoAccess,
          message: 'This account cannot create another workspace.',
        });
      }

      if (!input.name) {
        return reply.code(400).send({
          code: ApiErrorCode.WorkspaceNameRequired,
          message: 'Workspace name is required.',
        });
      }

      const account = await database
        .selectFrom('accounts')
        .selectAll()
        .where('id', '=', request.account.id)
        .executeTakeFirst();

      if (!account) {
        return reply.code(400).send({
          code: ApiErrorCode.AccountNotFound,
          message: 'Account not found.',
        });
      }

      const output = await createWorkspace(account, input);
      return output;
    },
  });

  done();
};
