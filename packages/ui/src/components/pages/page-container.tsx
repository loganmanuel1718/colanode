// Modified by Heard: avoid opening the phone keyboard when reading a page.
import { LocalPageNode } from '@colanode/client/types';
import { NodeRole, hasNodeRole } from '@colanode/core';
import { Document } from '@colanode/ui/components/documents/document';
import { useIsMobile } from '@colanode/ui/hooks/use-is-mobile';

interface PageContainerProps {
  page: LocalPageNode;
  role: NodeRole;
}

export const PageContainer = ({ page, role }: PageContainerProps) => {
  const isMobile = useIsMobile();
  const canEdit = hasNodeRole(role, 'editor');
  return (
    <Document
      node={page}
      canEdit={canEdit}
      autoFocus={isMobile ? undefined : 'start'}
    />
  );
};
