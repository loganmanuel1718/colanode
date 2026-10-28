import type { WorkspaceRole } from '@colanode/core';
import type { HeardIdentity } from '@colanode/server/lib/heard-identity';

export const heardWorkspaceRole = (
  role: HeardIdentity['role']
): WorkspaceRole => (role === 'admin' ? 'admin' : 'collaborator');
