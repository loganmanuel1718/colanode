import type { HeardIdentity } from '@colanode/server/lib/heard-identity';

export const heardWorkspaceRole = (
  role: HeardIdentity['role']
): 'admin' | 'collaborator' => (role === 'admin' ? 'admin' : 'collaborator');
