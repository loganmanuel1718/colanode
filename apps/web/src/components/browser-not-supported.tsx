// Modified by Heard: explain the mobile web runtime requirements on narrow screens.
import { MonitorOff } from 'lucide-react';

export const BrowserNotSupported = () => {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center px-6 py-8">
      <div className="flex w-full max-w-lg flex-col items-center gap-6 text-center">
        <MonitorOff className="h-10 w-10 text-foreground" />
        <h2 className="text-4xl text-foreground">Browser not supported</h2>
        <p className="text-sm text-muted-foreground">
          This browser is missing a local storage or background-worker feature
          that the workspace needs. Try an up-to-date browser with storage
          enabled.
        </p>
        <p className="text-sm text-muted-foreground">
          If you host this workspace, open it over HTTPS so the browser can use
          local storage and background workers.
        </p>
        <p className="text-sm text-muted-foreground mt-4">
          Try another browser. If you think this is a mistake, please open an
          issue on{' '}
          <a
            href="https://github.com/colanode/colanode"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary"
          >
            Github
          </a>
        </p>
      </div>
    </div>
  );
};
