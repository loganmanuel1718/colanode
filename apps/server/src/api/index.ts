import { FastifyPluginCallback } from 'fastify';

import { clientRoutes } from '@colanode/server/api/client/routes';
import { configGetRoute } from '@colanode/server/api/config';
import { heardLifecycleRoute } from '@colanode/server/api/heard-lifecycle';
import { homeRoute } from '@colanode/server/api/home';
import { config } from '@colanode/server/lib/config';
import { applyHeardLifecycleEvent } from '@colanode/server/lib/heard-lifecycle';

export const apiRoutes: FastifyPluginCallback = (instance, _, done) => {
  const prefix = config.pathPrefix ? `/${config.pathPrefix}` : '';

  instance.register(homeRoute, { prefix });
  instance.register(configGetRoute, { prefix });
  instance.register(clientRoutes, { prefix: `${prefix}/client/v1` });

  const heard = config.heard;
  if (heard.enabled && heard.lifecycle.enabled) {
    const lifecycle = heard.lifecycle;
    instance.register(
      heardLifecycleRoute({
        ingressSecret: lifecycle.ingressSecret,
        processEvent: (event) =>
          applyHeardLifecycleEvent(event, {
            resolverUrl: lifecycle.resolverUrl,
            clientSecret: heard.clientSecret,
            timeoutMs: lifecycle.timeoutMs,
          }),
      }),
      { prefix }
    );
  }

  done();
};
