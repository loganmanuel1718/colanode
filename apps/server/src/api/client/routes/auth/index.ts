import { FastifyPluginCallback } from 'fastify';

import { accountAuthenticator } from '@colanode/server/api/client/plugins/account-auth';
import { authIpRateLimiter } from '@colanode/server/api/client/plugins/auth-ip-rate-limit';
import { config } from '@colanode/server/lib/config';

import { emailLoginRoute } from './email-login';
import { emailPasswordResetCompleteRoute } from './email-password-reset-complete';
import { emailPasswordResetInitRoute } from './email-password-reset-init';
import { emailRegisterRoute } from './email-register';
import { emailVerifyRoute } from './email-verify';
import { googleLoginRoute } from './google-login';
import { logoutRoute } from './logout';

export const authRoutes: FastifyPluginCallback = (instance, _, done) => {
  // In Heard mode every identity comes from the Heard bridge. Native
  // registration, login, OTP verification, password reset and Google login
  // are not registered (404), so nobody can create a native account that holds
  // a Heard member's email and blocks that member's provisioning (HEA-277 F-1).
  // With heard.enabled false the routes register exactly as upstream.
  if (!config.heard.enabled) {
    instance.register((subInstance) => {
      subInstance.register(authIpRateLimiter);

      subInstance.register(emailLoginRoute);
      subInstance.register(emailRegisterRoute);
      subInstance.register(emailVerifyRoute);
      subInstance.register(emailPasswordResetInitRoute);
      subInstance.register(emailPasswordResetCompleteRoute);
      subInstance.register(googleLoginRoute);
    });
  }

  instance.register((subInstance) => {
    subInstance.register(accountAuthenticator);
    subInstance.register(logoutRoute);
  });

  done();
};
