// Modified by Heard: keep database view navigation and actions reachable on phone widths.
import { ReactNode } from 'react';

import { ViewTabs } from '@colanode/ui/components/databases/view-tabs';

interface ViewHeaderProps {
  actions: ReactNode;
}

export const ViewHeader = ({ actions }: ViewHeaderProps) => {
  return (
    <div className="flex min-w-0 flex-col border-b sm:flex-row sm:items-center sm:justify-between">
      <ViewTabs />
      <div className="flex max-w-full shrink-0 items-center justify-end gap-1 overflow-x-auto pb-1 sm:invisible sm:overflow-visible sm:pb-0 sm:group-hover/database:visible">
        {actions}
      </div>
    </div>
  );
};
