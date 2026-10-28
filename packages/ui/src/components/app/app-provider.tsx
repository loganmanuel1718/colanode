// Modified by Heard: show a recoverable error when local web initialization fails.
import { useEffect, useState } from 'react';

import { AppInitOutput, AppType } from '@colanode/client/types';
import { build } from '@colanode/core';
import { collections } from '@colanode/ui/collections';
import { AppAssets } from '@colanode/ui/components/app/app-assets';
import { AppLayout } from '@colanode/ui/components/app/app-layout';
import { AppLoading } from '@colanode/ui/components/app/app-loading';
import { AppReset } from '@colanode/ui/components/app/app-reset';
import { AppThemeProvider } from '@colanode/ui/components/app/app-theme-provider';
import { RadarProvider } from '@colanode/ui/components/app/radar-provider';
import { AppContext } from '@colanode/ui/contexts/app';

interface AppProviderProps {
  type: AppType;
}

export const AppProvider = ({ type }: AppProviderProps) => {
  const [initOutput, setInitOutput] = useState<AppInitOutput | null>(null);

  useEffect(() => {
    console.log(`Colanode | Version: ${build.version} | SHA: ${build.sha}`);

    window.colanode
      .init()
      .then((output) => {
        console.log('Colanode | Initialized');

        if (output === 'success') {
          collections
            .preload()
            .then(() => {
              setInitOutput('success');
            })
            .catch((err) => {
              setInitOutput('error');
              console.error('Colanode | Error preloading', err);
            });
        } else {
          setInitOutput(output);
        }
      })
      .catch((err) => {
        setInitOutput('error');
        console.error('Colanode | Error initializing', err);
      });
  }, []);

  return (
    <AppContext.Provider value={{ type }}>
      <AppThemeProvider init={initOutput}>
        <AppAssets />
        {initOutput === null && <AppLoading />}
        {initOutput === 'reset' && <AppReset />}
        {initOutput === 'error' && (
          <div
            className="flex h-full w-full items-center justify-center p-6"
            role="alert"
          >
            <div className="flex max-w-sm flex-col items-center gap-4 text-center">
              <h2 className="text-2xl font-semibold">
                Could not open the workspace
              </h2>
              <p className="text-sm text-muted-foreground">
                Check that browser storage is available, then reload this page.
              </p>
              <button
                type="button"
                className="min-h-11 rounded-md border px-4"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
            </div>
          </div>
        )}
        {initOutput === 'success' && (
          <RadarProvider>
            <AppLayout type={type} />
          </RadarProvider>
        )}
      </AppThemeProvider>
    </AppContext.Provider>
  );
};
