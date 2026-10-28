// Modified by Heard: keep sorting reachable by touch in the mobile view header.
import { ArrowDownAz } from 'lucide-react';

import { ViewSortAddPopover } from '@colanode/ui/components/databases/search/view-sort-add-popover';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';

export const ViewSortButton = () => {
  const view = useDatabaseView();

  if (view.sorts.length > 0) {
    return (
      <button
        type="button"
        aria-label="Show sorts"
        className="flex size-11 cursor-pointer items-center justify-center rounded-md hover:bg-accent sm:size-auto sm:p-1.5"
        onClick={() => view.openSearchBar()}
      >
        <ArrowDownAz className="size-4" />
      </button>
    );
  }

  return (
    <ViewSortAddPopover>
      <button
        type="button"
        aria-label="Add sort"
        className="flex size-11 cursor-pointer items-center justify-center rounded-md hover:bg-accent sm:size-auto sm:p-1.5"
      >
        <ArrowDownAz className="size-4" />
      </button>
    </ViewSortAddPopover>
  );
};
