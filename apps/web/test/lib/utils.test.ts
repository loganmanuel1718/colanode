// Modified by Heard: verify capability-based mobile web startup.
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isOpfsSupported,
  isWebRuntimeSupported,
} from '@colanode/web/lib/utils';

describe('lib/utils', () => {
  afterEach(() => vi.unstubAllGlobals());

  describe('isOpfsSupported', () => {
    it('returns false when navigator.storage is undefined', async () => {
      vi.stubGlobal('navigator', {});
      const result = await isOpfsSupported();
      expect(result).toBe(false);
    });

    it('returns false when navigator.storage.getDirectory is undefined', async () => {
      vi.stubGlobal('navigator', {
        storage: {},
      });
      const result = await isOpfsSupported();
      expect(result).toBe(false);
    });

    it('returns false when getDirectory returns null', async () => {
      vi.stubGlobal('navigator', {
        storage: {
          getDirectory: vi.fn().mockResolvedValue(null),
        },
      });
      const result = await isOpfsSupported();
      expect(result).toBe(false);
    });

    it('returns false when getDirectory throws an error', async () => {
      vi.stubGlobal('navigator', {
        storage: {
          getDirectory: vi.fn().mockRejectedValue(new Error('Not supported')),
        },
      });
      const result = await isOpfsSupported();
      expect(result).toBe(false);
    });

    it('returns true when getDirectory returns a valid directory handle', async () => {
      const mockDirectoryHandle = {
        kind: 'directory',
        name: 'root',
      };
      vi.stubGlobal('navigator', {
        storage: {
          getDirectory: vi.fn().mockResolvedValue(mockDirectoryHandle),
        },
      });
      const result = await isOpfsSupported();
      expect(result).toBe(true);
    });

    it('calls getDirectory to verify OPFS functionality', async () => {
      const getDirectoryMock = vi.fn().mockResolvedValue({ kind: 'directory' });
      vi.stubGlobal('navigator', {
        storage: {
          getDirectory: getDirectoryMock,
        },
      });
      await isOpfsSupported();
      expect(getDirectoryMock).toHaveBeenCalledOnce();
    });
  });

  describe('isWebRuntimeSupported', () => {
    it('allows a mobile user agent when the required APIs are available', async () => {
      vi.stubGlobal('Worker', class {});
      vi.stubGlobal('BroadcastChannel', class {});
      vi.stubGlobal('navigator', {
        userAgent: 'iPhone',
        locks: { request: vi.fn() },
        storage: {
          getDirectory: vi.fn().mockResolvedValue({ kind: 'directory' }),
        },
      });

      expect(await isWebRuntimeSupported()).toBe(true);
    });

    it('rejects browsers without Web Locks even if OPFS exists', async () => {
      vi.stubGlobal('Worker', class {});
      vi.stubGlobal('BroadcastChannel', class {});
      vi.stubGlobal('navigator', {
        storage: {
          getDirectory: vi.fn().mockResolvedValue({ kind: 'directory' }),
        },
      });

      expect(await isWebRuntimeSupported()).toBe(false);
    });
  });
});
