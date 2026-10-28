// Modified by Heard: gate mobile web by required browser capabilities rather than user agent.
export const isOpfsSupported = async (): Promise<boolean> => {
  try {
    // Check if the storage API exists
    if (!navigator.storage || !navigator.storage.getDirectory) {
      return false;
    }

    // Try to actually get a directory to confirm OPFS works
    const root = await navigator.storage.getDirectory();
    if (!root) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

export const isWebRuntimeSupported = async (): Promise<boolean> => {
  if (
    typeof Worker === 'undefined' ||
    typeof BroadcastChannel === 'undefined' ||
    !navigator.locks?.request
  ) {
    return false;
  }

  return isOpfsSupported();
};
