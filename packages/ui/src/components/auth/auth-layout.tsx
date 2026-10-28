// Modified by Heard: keep the web sign-in flow usable on narrow phone viewports.
import { Outlet } from '@tanstack/react-router';
import { useState } from 'react';

import { Server } from '@colanode/client/types';
import { AuthCancel } from '@colanode/ui/components/auth/auth-cancel';
import { AuthServer } from '@colanode/ui/components/auth/auth-server';
import { ColanodeLogo } from '@colanode/ui/components/ui/logo';
import { AuthContext } from '@colanode/ui/contexts/auth';

export const AuthLayout = () => {
  const [server, setServer] = useState<Server | null>(null);

  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center px-4 py-6">
      <AuthCancel />
      <div className="flex w-full flex-col items-center justify-center gap-6 lg:flex-row lg:gap-40">
        <div className="flex flex-col items-center justify-center bg-background py-4 lg:px-6 lg:py-12">
          <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
            <div className="logo-draw-animation">
              <ColanodeLogo className="size-14 lg:size-50" />
            </div>
            <p className="font-satoshi text-xl tracking-tight sm:text-3xl">
              Your all-in-one <br /> collaboration platform
            </p>
          </div>
        </div>

        <div className="flex w-full max-w-sm flex-col items-center justify-center bg-background">
          {server ? (
            <AuthContext.Provider value={{ server }}>
              <Outlet />
            </AuthContext.Provider>
          ) : (
            <AuthServer onSelect={setServer} />
          )}
        </div>
      </div>
    </div>
  );
};
